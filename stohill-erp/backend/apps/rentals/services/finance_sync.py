import logging
from decimal import Decimal
from django.db import transaction  # type: ignore
from django.utils import timezone  # type: ignore

from apps.rentals.models import Lease, RentalInvoice, RentalPayment  # type: ignore
from apps.finance.models.ar import CustomerProfile, CustomerInvoice, CustomerInvoiceLine, CustomerReceipt  # type: ignore
from apps.finance.models.core import ChartOfAccount, Journal  # type: ignore
from apps.finance.models.bank import BankAccount  # type: ignore
from apps.finance.services.accounting import AccountingService  # type: ignore

logger = logging.getLogger('stohill.rentals.sync')

class RentalFinanceSyncService:
    """
    Synchronizes Rental module transactions with Finance Accounts Receivable (AR).
    """

    @classmethod
    def ensure_rental_accounts(cls):
        """Ensure standard rental accounts exist in the CoA."""
        # This is ideally handled by database seeds, but we can verify here if needed
        pass

    @classmethod
    def sync_tenant_to_customer(cls, tenant):
        """
        Ensure the CRM Contact (tenant) has a CustomerProfile in Finance AR.
        """
        try:
            # 1100 is standard AR account code in stohill GL
            ar_account = ChartOfAccount.objects.get(code='1100')
        except ChartOfAccount.DoesNotExist:
            logger.error("Accounts Receivable account (code 1100) not found in Chart of Accounts.")
            raise

        profile, created = CustomerProfile.objects.get_or_create(
            contact_link=tenant,
            defaults={
                'name': tenant.full_name,
                'ar_account': ar_account,
                'payment_terms_days': 0  # Rent is due immediately basically
            }
        )
        return profile

    @classmethod
    @transaction.atomic
    def sync_rental_invoice_to_ar(cls, rental_invoice: RentalInvoice):
        """
        Mirror a RentalInvoice to Finance CustomerInvoice and post it.
        """
        if rental_invoice.is_posted_to_finance:
            return rental_invoice.journal_entry
            
        # Get or create AR Customer Profile
        customer = cls.sync_tenant_to_customer(rental_invoice.lease.tenant)
        
        # We need the Rental Income account
        try:
            rental_income_account = ChartOfAccount.objects.get(code='4100')
        except ChartOfAccount.DoesNotExist:
            logger.error("Rental Income account (code 4100) not found in Chart of Accounts.")
            raise
            
        # Create AR Customer Invoice
        ar_invoice = CustomerInvoice.objects.create(
            customer=customer,
            invoice_number=f"AR-{rental_invoice.invoice_number}",
            invoice_date=rental_invoice.period_start,
            due_date=rental_invoice.due_date,
            reference=f"Rent for {rental_invoice.lease.lease_number}",
            subtotal=rental_invoice.rental_amount,
            tax_total=rental_invoice.vat_amount,
            total_amount=rental_invoice.total_amount,
            status=CustomerInvoice.InvoiceStatus.DRAFT
        )
        
        # Create Line Item for Rent
        CustomerInvoiceLine.objects.create(
            invoice=ar_invoice,
            description=f"Monthly Rent: {rental_invoice.period_start.strftime('%B %Y')}",
            revenue_account=rental_income_account,
            quantity=1,
            unit_price=rental_invoice.rental_amount,
            tax_amount=rental_invoice.vat_amount,
            line_total=rental_invoice.rental_amount
        )
        
        # Post it to GL using the AccountingService
        # Note: AccountingService.post_customer_invoice handles setting it to POSTED
        service = AccountingService()
        try:
            je = service.post_customer_invoice(ar_invoice)
            
            ar_invoice.status = CustomerInvoice.InvoiceStatus.POSTED
            ar_invoice.journal_entry = je
            ar_invoice.save(update_fields=['status', 'journal_entry'])
            
            # Update original RentalInvoice
            rental_invoice.is_posted_to_finance = True
            rental_invoice.journal_entry = je
            rental_invoice.save(update_fields=['is_posted_to_finance', 'journal_entry'])
            
            return je
        except Exception as e:
            logger.error(f"Failed to post rental invoice {rental_invoice.invoice_number} to AR: {str(e)}")
            raise

    @classmethod
    @transaction.atomic
    def sync_rental_payment_to_ar(cls, rental_payment: RentalPayment):
        """
        Mirror a RentalPayment to Finance CustomerReceipt and post it.
        Supports withholding tax and deduction from tenant balance.
        """
        if rental_payment.journal_entry:
            return rental_payment.journal_entry
            
        rental_invoice = rental_payment.invoice
        # Ensure the tenant is a customer
        customer = cls.sync_tenant_to_customer(rental_invoice.lease.tenant)
        
        # Identify bank account (Use main operations account)
        bank_account = BankAccount.objects.filter(is_active=True).first()
        if not bank_account:
            raise Exception("No active Bank Account found for posting payment.")
            
        # Determine total amount to credit AR
        total_payment_value = rental_payment.amount + rental_payment.withholding_tax + rental_payment.amount_from_balance
        
        # Create AR Customer Receipt
        # Note: CustomerReceipt normally only tracks the cash portion.
        # But we'll use it as the trigger for the full GL entry.
        receipt = CustomerReceipt.objects.create(
            customer=customer,
            receipt_date=rental_payment.payment_date,
            receipt_reference=rental_payment.reference,
            amount=rental_payment.amount,
            bank_account=bank_account,
            status=CustomerReceipt.ReceiptStatus.DRAFT
        )
        
        # Post to GL with custom logic for deductions
        service = AccountingService()
        try:
            # We override the standard posting if deductions exist
            if rental_payment.withholding_tax > 0 or rental_payment.amount_from_balance > 0:
                # Need specific CoA for WHT Receivable and Tenant Deposits
                try:
                    # Let's try to get them from PostingProfile or default codes
                    from apps.finance.models.core import PostingProfile  # type: ignore
                    profile = PostingProfile.objects.filter(is_default=True).first()
                    
                    wht_account = ChartOfAccount.objects.filter(code='1120').first() or \
                                 ChartOfAccount.objects.filter(name__icontains='Withholding').first() or \
                                 ChartOfAccount.objects.get(code='2110') # Fallback to VAT Rec
                                 
                    deposit_account = profile.tenant_deposits if profile else ChartOfAccount.objects.get(code='2200')
                except ChartOfAccount.DoesNotExist:
                    logger.error("Required accounts for rental payment deductions not found.")
                    raise
                    
                # Manual JE creation (reusing service helpers where possible)
                je = service.record_rental_payment_with_deductions(
                    rental_payment, customer, bank_account, wht_account, deposit_account
                )
            else:
                je = service.post_customer_receipt(receipt)
            
            receipt.status = CustomerReceipt.ReceiptStatus.POSTED
            receipt.journal_entry = je
            receipt.save(update_fields=['status', 'journal_entry'])
            
            rental_payment.journal_entry = je
            rental_payment.save(update_fields=['journal_entry'])
            
            # Update original RentalInvoice balances
            # Use total_payment_value instead of just amount
            rental_invoice.amount_paid += total_payment_value
            rental_invoice.balance_due = rental_invoice.total_amount - rental_invoice.amount_paid
            if rental_invoice.balance_due <= 0:
                rental_invoice.status = RentalInvoice.InvoiceStatus.PAID
            elif rental_invoice.amount_paid > 0:
                rental_invoice.status = RentalInvoice.InvoiceStatus.PARTIAL
            rental_invoice.save(update_fields=['amount_paid', 'balance_due', 'status'])
            
            # Update AR invoice balances as well
            ar_invoice = CustomerInvoice.objects.filter(journal_entry=rental_invoice.journal_entry).first()
            if ar_invoice:
                ar_invoice.amount_paid += total_payment_value
                if ar_invoice.amount_paid >= ar_invoice.total_amount:
                    ar_invoice.status = CustomerInvoice.InvoiceStatus.PAID
                elif ar_invoice.amount_paid > 0:
                    ar_invoice.status = CustomerInvoice.InvoiceStatus.PARTIAL
                ar_invoice.save(update_fields=['amount_paid', 'status'])
            
            return je
                
        except Exception as e:
            logger.error(f"Failed to post rental payment {rental_payment.reference} to AR: {str(e)}")
            raise
