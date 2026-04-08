import logging
from decimal import Decimal
from django.db import transaction  # type: ignore
from django.utils import timezone  # type: ignore

from apps.finance.models import (  # type: ignore
    ChartOfAccount, Journal, TaxCode, CustomerProfile, 
    CustomerInvoice, CustomerInvoiceLine, CustomerReceipt
)
from apps.finance.models.bank import BankAccount  # type: ignore
from apps.finance.services.accounting import AccountingService  # type: ignore

logger = logging.getLogger('stohill.rentals.sync')

class RentalFinanceSyncService:
    """
    Synchronizes Rental module transactions with Finance Accounts Receivable (AR) and General Ledger.
    """

    @classmethod
    def sync_tenant_to_customer(cls, tenant):
        """
        Ensure the CRM Contact (tenant) has a CustomerProfile in Finance AR.
        """
        service = AccountingService()
        try:
            # Use dynamic lookup from PostingProfile
            ar_account_code = service.get_account('ACCOUNTS_RECEIVABLE')
            ar_account = ChartOfAccount.objects.get(code=ar_account_code)
        except (ChartOfAccount.DoesNotExist, Exception):
            logger.error("Accounts Receivable account configuration missing.")
            raise

        profile, created = CustomerProfile.objects.get_or_create(
            contact_link=tenant,
            defaults={
                'name': tenant.full_name,
                'ar_account': ar_account,
                'payment_terms_days': 0
            }
        )
        return profile

    @classmethod
    @transaction.atomic
    def sync_lease_deposit_to_gl(cls, lease):
        """
        When a lease is activated and deposit is paid, record the liability in Finance.
        Debit: Bank (Trust)
        Credit: Tenant Deposits (Liability)
        """
        from django.apps import apps
        Lease = apps.get_model('rentals', 'Lease')
        if not lease.deposit_paid or lease.deposit_amount <= 0:
            return None
            
        service = AccountingService()
        try:
            # 1. Resolve Accounts
            bank_account_code = service.get_account('BANK_TRUST')
            deposit_account_code = service.get_account('TENANT_DEPOSITS')
            
            # 2. Build Posting Data
            from apps.finance.services.accounting import PostingData
            entry_date = lease.deposit_paid_date or lease.start_date
            
            posting = PostingData(
                description=f"Security Deposit: {lease.tenant.full_name} - {lease.lease_number}",
                entry_date=entry_date,
                source_module='rentals',
                source_id=lease.id,
                source_reference=lease.lease_number,
                currency_code=lease.currency.code if lease.currency else 'USD'
            )
            
            posting.add_debit(bank_account_code, lease.deposit_amount, f"Deposit Received - {lease.lease_number}")
            posting.add_credit(deposit_account_code, lease.deposit_amount, f"Deposit Liability - {lease.lease_number}")
            
            # 3. Post to GL
            je = service.post_entry(posting, journal_code='GJ')
            logger.info(f"Synchronized Deposit for Lease {lease.lease_number} to GL: {je.reference}")
            return je
            
        except Exception as e:
            logger.error(f"Failed to sync deposit for lease {lease.lease_number}: {str(e)}")
            raise

    @classmethod
    @transaction.atomic
    def sync_rental_invoice_to_ar(cls, rental_invoice):
        """
        Mirror a RentalInvoice to Finance CustomerInvoice and post it.
        """
        from django.apps import apps
        RentalInvoice = apps.get_model('rentals', 'RentalInvoice')
        if rental_invoice.is_posted_to_finance:
            return rental_invoice.journal_entry
            
        service = AccountingService()
        customer = cls.sync_tenant_to_customer(rental_invoice.lease.tenant)
        
        try:
            rental_income_account_code = service.get_account('RENTAL_INCOME')
            rental_income_account = ChartOfAccount.objects.get(code=rental_income_account_code)
        except (ChartOfAccount.DoesNotExist, Exception):
            logger.error("Rental Income account configuration missing.")
            raise
            
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
        
        # Resolve Tax Code if VAT is applicable
        tax_code = None
        if rental_invoice.vat_amount > 0:
            tax_code = TaxCode.objects.filter(code='VAT15').first()
            if not tax_code:
                # Fallback to any active tax code if VAT15 not found
                tax_code = TaxCode.objects.filter(is_active=True).first()

        CustomerInvoiceLine.objects.create(
            invoice=ar_invoice,
            description=f"Monthly Rent: {rental_invoice.period_start.strftime('%B %Y')}",
            revenue_account=rental_income_account,
            quantity=1,
            unit_price=rental_invoice.rental_amount,
            tax_code=tax_code,
            tax_amount=rental_invoice.vat_amount,
            line_total=rental_invoice.total_amount
        )
        
        try:
            je = service.post_customer_invoice(ar_invoice)
            
            ar_invoice.status = CustomerInvoice.InvoiceStatus.POSTED
            ar_invoice.journal_entry = je
            ar_invoice.save(update_fields=['status', 'journal_entry'])
            
            rental_invoice.is_posted_to_finance = True
            rental_invoice.journal_entry = je
            rental_invoice.save(update_fields=['is_posted_to_finance', 'journal_entry'])
            
            return je
        except Exception as e:
            logger.error(f"Failed to post rental invoice {rental_invoice.invoice_number} to AR: {str(e)}")
            raise

    @classmethod
    @transaction.atomic
    def sync_rental_payment_to_ar(cls, rental_payment):
        """
        Mirror a RentalPayment to Finance CustomerReceipt and post it.
        """
        from django.apps import apps
        RentalPayment = apps.get_model('rentals', 'RentalPayment')
        RentalInvoice = apps.get_model('rentals', 'RentalInvoice')
        if rental_payment.journal_entry:
            return rental_payment.journal_entry
            
        service = AccountingService()
        rental_invoice = rental_payment.invoice
        customer = cls.sync_tenant_to_customer(rental_invoice.lease.tenant)
        
        bank_account = BankAccount.objects.filter(is_active=True).first()
        if not bank_account:
            raise Exception("No active Bank Account found for posting payment.")
            
        total_payment_value = rental_payment.amount + rental_payment.withholding_tax + rental_payment.amount_from_balance
        
        receipt = CustomerReceipt.objects.create(
            customer=customer,
            receipt_date=rental_payment.payment_date,
            receipt_reference=rental_payment.reference,
            amount=rental_payment.amount,
            bank_account=bank_account,
            status=CustomerReceipt.ReceiptStatus.DRAFT
        )
        
        try:
            if rental_payment.withholding_tax > 0 or rental_payment.amount_from_balance > 0:
                try:
                    wht_account_code = service.get_account('VAT_RECEIVABLE')
                    wht_account = ChartOfAccount.objects.filter(code='1120').first() or \
                                 ChartOfAccount.objects.filter(name__icontains='Withholding').first() or \
                                 ChartOfAccount.objects.get(code=wht_account_code)
                                 
                    deposit_account_code = service.get_account('TENANT_DEPOSITS')
                    deposit_account = ChartOfAccount.objects.get(code=deposit_account_code)
                except (ChartOfAccount.DoesNotExist, Exception):
                    logger.error("Required accounts for rental payment deductions not found.")
                    raise
                    
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
            
            rental_invoice.amount_paid += total_payment_value
            rental_invoice.balance_due = rental_invoice.total_amount - rental_invoice.amount_paid
            if rental_invoice.balance_due <= 0:
                rental_invoice.status = RentalInvoice.InvoiceStatus.PAID
            elif rental_invoice.amount_paid > 0:
                rental_invoice.status = RentalInvoice.InvoiceStatus.PARTIAL
            rental_invoice.save(update_fields=['amount_paid', 'balance_due', 'status'])
            
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
