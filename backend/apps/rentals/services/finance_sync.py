import logging
from decimal import Decimal
from django.db import transaction  # type: ignore
from django.utils import timezone  # type: ignore

from apps.rentals.models import Lease, RentalInvoice, RentalPayment  # type: ignore
from apps.finance.models.ar import CustomerProfile, CustomerInvoice, CustomerInvoiceLine, CustomerReceipt  # type: ignore
from apps.finance.models.core import ChartOfAccount, Journal  # type: ignore
from apps.finance.models.bank import BankAccount  # type: ignore
from apps.finance.services.accounting import AccountingError, AccountingService  # type: ignore

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

    @staticmethod
    def _account(code, label):
        try:
            return ChartOfAccount.objects.get(code=code)
        except ChartOfAccount.DoesNotExist:
            logger.error("%s account (code %s) not found in Chart of Accounts.", label, code)
            raise

    @classmethod
    def _late_fee_account(cls):
        return (ChartOfAccount.objects.filter(code='4910').first()
                or cls._account('4900', 'Other Income'))

    @staticmethod
    def _mirrored_ar_invoices(rental_invoice):
        return CustomerInvoice.objects.filter(
            invoice_number__startswith=f"AR-{rental_invoice.invoice_number}"
        ).order_by('invoice_date', 'created_at')

    @classmethod
    def allocate_to_ar(cls, rental_invoice, amount, receipt=None, note=''):
        """
        Settle the AR invoices mirroring a rental invoice (rent first, then
        late-fee notes). With a receipt this goes through SettlementService;
        otherwise (deposit applied, payments with deductions whose entry
        already credited AR) the invoices are settled and the allocation is
        recorded without a cash document.
        """
        from apps.finance.models import ARAllocation
        from apps.finance.services.settlement import SettlementService

        pairs, remaining = [], amount
        for ar_invoice in cls._mirrored_ar_invoices(rental_invoice):
            if remaining <= 0:
                break
            if ar_invoice.status not in (CustomerInvoice.InvoiceStatus.POSTED,
                                         CustomerInvoice.InvoiceStatus.PARTIAL,
                                         CustomerInvoice.InvoiceStatus.OVERDUE):
                continue
            applied = min(remaining, ar_invoice.balance_due)
            if applied > 0:
                pairs.append((ar_invoice, applied))
                remaining -= applied

        if receipt is not None:
            SettlementService().allocate_receipt(receipt, pairs)
            return
        for ar_invoice, applied in pairs:
            SettlementService._settle_invoice(ar_invoice, applied)
            ARAllocation.objects.create(kind=ARAllocation.Kind.PAYMENT, invoice=ar_invoice,
                                        allocation_date=ar_invoice.invoice_date, amount=applied,
                                        notes=note[:255] or f'Settled from rental invoice {rental_invoice.invoice_number}')

    @classmethod
    @transaction.atomic
    def post_late_fee(cls, rental_invoice: RentalInvoice, fee_amount: Decimal, fee_date):
        """
        Charge a late fee on an invoice that is already in the GL.

        Raises an AR debit note (Dr AR / Cr Late Payment Fees) so the ledger
        matches the rental sub-ledger. The overdue job used to change the
        rental invoice total only, leaving AR and the GL understated.
        """
        if fee_amount <= 0 or not rental_invoice.is_posted_to_finance:
            return None
        customer = cls.sync_tenant_to_customer(rental_invoice.lease.tenant)
        seq = cls._mirrored_ar_invoices(rental_invoice).count()
        note = CustomerInvoice.objects.create(
            customer=customer,
            invoice_number=f"AR-{rental_invoice.invoice_number}-LF{seq}",
            invoice_date=fee_date,
            due_date=fee_date,
            currency=rental_invoice.currency or rental_invoice.lease.currency,
            reference=f"Late fee on {rental_invoice.invoice_number}",
            subtotal=fee_amount,
            total_amount=fee_amount,
            status=CustomerInvoice.InvoiceStatus.DRAFT,
        )
        CustomerInvoiceLine.objects.create(
            invoice=note, description=f"Late payment fee - {rental_invoice.invoice_number}",
            revenue_account=cls._late_fee_account(), quantity=1,
            unit_price=fee_amount, line_total=fee_amount,
        )
        je = AccountingService().post_customer_invoice(note)
        note.status = CustomerInvoice.InvoiceStatus.POSTED
        note.journal_entry = je
        note.save(update_fields=['status', 'journal_entry'])
        return je

    @classmethod
    def _invoice_lines(cls, rental_invoice, rental_income_account):
        """
        AR lines for a rental invoice. line_total is gross (VAT inclusive).

        Managed property: the rent belongs to the owner and is credited to
        Owner Funds Held (trust), less the agency's management fee, which is
        the agency's revenue. Company-owned: rent is rental income.
        """
        cent = Decimal('0.01')
        lease = rental_invoice.lease
        prop = lease.property
        rent, vat = rental_invoice.rental_amount, rental_invoice.vat_amount
        period = rental_invoice.period_start.strftime('%B %Y')
        lines = []
        if prop.is_managed:
            mgmt_fee = (rent * prop.management_fee_rate / 100).quantize(cent)
            lines.append({'description': f'Rent {period} (held for owner)',
                          'revenue_account': cls._account('2210', 'Owner Funds Held'),
                          'unit_price': rent - mgmt_fee, 'tax_amount': vat, 'line_total': rent - mgmt_fee + vat})
            if mgmt_fee:
                lines.append({'description': f'Management fee {prop.management_fee_rate}%',
                              'revenue_account': cls._account('4300', 'Property Management Fees'),
                              'unit_price': mgmt_fee, 'tax_amount': Decimal('0'), 'line_total': mgmt_fee})
        else:
            lines.append({'description': f'Monthly Rent: {period}', 'revenue_account': rental_income_account,
                          'unit_price': rent, 'tax_amount': vat, 'line_total': rent + vat})

        for charge in rental_invoice.charges or []:
            amount, charge_vat = Decimal(str(charge['amount'])), Decimal(str(charge.get('vat', '0')))
            lines.append({'description': charge['description'],
                          'revenue_account': cls._account(charge.get('account_code') or '4920', 'Recoveries'),
                          'unit_price': amount, 'tax_amount': charge_vat, 'line_total': amount + charge_vat})

        fee = rental_invoice.late_payment_fee or Decimal('0.00')
        if fee > 0:
            lines.append({'description': 'Late payment fee', 'revenue_account': cls._late_fee_account(),
                          'unit_price': fee, 'tax_amount': Decimal('0'), 'line_total': fee})
        return lines

    @classmethod
    @transaction.atomic
    def credit_rental_invoice(cls, rental_invoice, amount: Decimal, reason: str, on):
        """
        Credit (part of) a posted rental invoice: an AR credit note in the
        same proportions as the invoice, applied to the mirrored AR invoice.
        Used when a lease terminates inside an already-billed period.
        """
        from apps.finance.services.settlement import SettlementService

        amount = Decimal(amount)
        if amount <= 0 or amount > rental_invoice.total_amount - rental_invoice.credited_amount:
            raise AccountingError('Credit exceeds what remains on the rental invoice.')
        ar_invoice = CustomerInvoice.objects.get(invoice_number=f'AR-{rental_invoice.invoice_number}')
        ratio = amount / rental_invoice.total_amount
        cent = Decimal('0.01')
        note = CustomerInvoice.objects.create(
            customer=ar_invoice.customer, document_type=CustomerInvoice.DocumentType.CREDIT_NOTE,
            original_invoice=ar_invoice, invoice_date=on, due_date=on, currency=ar_invoice.currency,
            reference=f'{reason} ({rental_invoice.invoice_number})', status=CustomerInvoice.InvoiceStatus.DRAFT,
            subtotal=0, tax_total=0, total_amount=amount,
        )
        remaining = amount
        src_lines = list(ar_invoice.lines.all())
        for i, src in enumerate(src_lines):
            gross = remaining if i == len(src_lines) - 1 else (src.line_total * ratio).quantize(cent)
            tax = (src.tax_amount * ratio).quantize(cent) if src.line_total else Decimal('0')
            remaining -= gross
            CustomerInvoiceLine.objects.create(
                invoice=note, description=f'Credit: {src.description}', revenue_account=src.revenue_account,
                quantity=1, unit_price=gross - tax, tax_amount=min(tax, gross), line_total=gross,
                property_ref=src.property_ref, cost_center=src.cost_center)
        note.tax_total = sum(ln.tax_amount for ln in note.lines.all())
        note.subtotal = amount - note.tax_total
        note.save(update_fields=['tax_total', 'subtotal'])

        entry = AccountingService().post_customer_invoice(note)
        note.status, note.journal_entry = CustomerInvoice.InvoiceStatus.POSTED, entry
        note.save(update_fields=['status', 'journal_entry'])

        # Apply the credit to what is still open on the invoice; any excess
        # (already paid) stays on the credit note as tenant credit.
        ar_invoice.refresh_from_db()
        applicable = min(amount, ar_invoice.balance_due)
        if applicable > 0 and ar_invoice.status in (CustomerInvoice.InvoiceStatus.POSTED,
                                                     CustomerInvoice.InvoiceStatus.PARTIAL,
                                                     CustomerInvoice.InvoiceStatus.OVERDUE):
            SettlementService().apply_credit_note(note, [(ar_invoice, applicable)], on)

        rental_invoice.credited_amount += amount
        rental_invoice.balance_due = max(rental_invoice.total_amount - rental_invoice.credited_amount
                                         - rental_invoice.amount_paid, Decimal('0'))
        if rental_invoice.credited_amount >= rental_invoice.total_amount:
            rental_invoice.status = RentalInvoice.InvoiceStatus.CANCELLED
        elif rental_invoice.balance_due == 0:
            rental_invoice.status = RentalInvoice.InvoiceStatus.PAID
        rental_invoice.save(update_fields=['credited_amount', 'balance_due', 'status'])
        return note

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
        
        rental_income_account = cls._account('4100', 'Rental Income')

        # CustomerInvoiceLine.line_total is GROSS (tax inclusive); the posting
        # service credits revenue with line_total - tax_amount. The rent line
        # used to carry the net rent as line_total while AR was debited with
        # the full total, so any invoice with VAT or a late fee was unbalanced
        # and the error was swallowed by RentalInvoice.save().
        lines = cls._invoice_lines(rental_invoice, rental_income_account)
        total = sum(ln['line_total'] for ln in lines)
        if total != rental_invoice.total_amount:
            raise AccountingError(
                f"Rental invoice {rental_invoice.invoice_number} total {rental_invoice.total_amount} "
                f"does not equal rent + VAT + charges + late fee ({total})."
            )
        tax_total = sum(ln.get('tax_amount', Decimal('0')) for ln in lines)

        # Create AR Customer Invoice
        ar_invoice = CustomerInvoice.objects.create(
            customer=customer,
            invoice_number=f"AR-{rental_invoice.invoice_number}",
            invoice_date=rental_invoice.period_start,
            due_date=rental_invoice.due_date,
            currency=rental_invoice.currency or rental_invoice.lease.currency,
            reference=f"Rent for {rental_invoice.lease.lease_number}",
            subtotal=total - tax_total,
            tax_total=tax_total,
            total_amount=total,
            status=CustomerInvoice.InvoiceStatus.DRAFT
        )
        CustomerInvoiceLine.objects.bulk_create([
            CustomerInvoiceLine(invoice=ar_invoice, quantity=1, property_ref=rental_invoice.lease.property, **ln)
            for ln in lines
        ])
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
            raise AccountingError("No active bank account is set up to receive payments.")
            
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
            currency=rental_invoice.currency or rental_invoice.lease.currency,
            bank_account=bank_account,
            status=CustomerReceipt.ReceiptStatus.DRAFT
        )
        plain_receipt = not (rental_payment.withholding_tax > 0 or rental_payment.amount_from_balance > 0)
        
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
                je = service.post_customer_receipt(receipt, allocate=False)
            
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
            
            # Settle the AR invoices mirroring this rental invoice: the rent
            # invoice first, then any late-fee debit notes. A plain cash
            # receipt settles through its receipt (allocation audit trail);
            # payments with WHT/balance deductions post their own entry.
            cls.allocate_to_ar(rental_invoice, total_payment_value,
                               receipt=receipt if plain_receipt else None,
                               note='' if plain_receipt else f'Rental payment {rental_payment.reference} (with deductions)')
            
            return je
                
        except Exception as e:
            logger.error(f"Failed to post rental payment {rental_payment.reference} to AR: {str(e)}")
            raise
