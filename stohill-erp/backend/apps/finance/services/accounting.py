"""
Stohil Properties - Accounting Posting Service Layer
Central service for all financial postings.

This service ensures:
1. Atomic transactions (all-or-nothing posting)
2. Double-entry validation (debits == credits)
3. Period lock enforcement
4. Immutability of posted entries
5. Automatic reference number generation
6. Audit trail creation

Usage:
    from apps.finance.services.accounting import AccountingService

    service = AccountingService(user=request.user)
    entry = service.post_sale_transaction(sale_transaction)
"""

import logging
from decimal import Decimal
from datetime import date
from django.db import transaction, models  # type: ignore
from django.utils import timezone  # type: ignore
from django.core.exceptions import ValidationError  # type: ignore

from apps.finance.models import (  # type: ignore
    ChartOfAccount, Journal, JournalEntry, JournalLine,
    FiscalPeriod, FiscalYear, TaxCode, TaxTransaction, PostingProfile
)

logger = logging.getLogger('stohill.finance')


class AccountingError(Exception):
    """Raised when an accounting operation fails validation."""
    pass


class PostingData:
    """
    Value object representing a complete journal entry ready to post.
    Use this to build entries before submitting to AccountingService.
    """

    def __init__(self, description: str, entry_date: date, source_module: str = '',
                 source_id=None, source_reference: str = '', currency_code: str = 'USD', exchange_rate: Decimal = Decimal('1.0')):
        self.description = description
        self.entry_date = entry_date
        self.source_module = source_module
        self.source_id = source_id
        self.source_reference = source_reference
        self.currency_code = currency_code
        self.exchange_rate = Decimal(str(exchange_rate))
        self.lines = []  # List of dictionaries

    def add_debit(self, account_code: str, amount: Decimal, description: str = '',
                  property_ref=None, contact_ref=None, supplier_ref=None):
        """Add a debit line to this posting."""
        self.lines.append({
            'account_code': account_code,
            'side': 'debit',
            'amount': Decimal(str(amount)),
            'description': description,
            'property_ref': property_ref,
            'contact_ref': contact_ref,
            'supplier_ref': supplier_ref,
        })
        return self

    def add_credit(self, account_code: str, amount: Decimal, description: str = '',
                   property_ref=None, contact_ref=None, supplier_ref=None):
        """Add a credit line to this posting."""
        self.lines.append({
            'account_code': account_code,
            'side': 'credit',
            'amount': Decimal(str(amount)),
            'description': description,
            'property_ref': property_ref,
            'contact_ref': contact_ref,
            'supplier_ref': supplier_ref,
        })
        return self

    def total_debits(self):
        return sum(l['amount'] for l in self.lines if l['side'] == 'debit')

    def total_credits(self):
        return sum(l['amount'] for l in self.lines if l['side'] == 'credit')

    def is_balanced(self):
        return self.total_debits() == self.total_credits()


class AccountingService:
    """
    Core accounting service for all financial postings.
    All journal entries MUST go through this service to ensure integrity.
    """

    # Static fallbacks for system account codes (used if no PostingProfile is configured)
    DEFAULT_ACCOUNTS = {
        'BANK_MAIN': '1010',
        'BANK_TRUST': '1020',
        'ACCOUNTS_RECEIVABLE': '1100',
        'COMMISSION_RECEIVABLE': '1110',
        'PREPAID_EXPENSES': '1200',
        'ACCOUNTS_PAYABLE': '2000',
        'VAT_PAYABLE': '2100',
        'VAT_RECEIVABLE': '2110',
        'TENANT_DEPOSITS': '2200',
        'DEFERRED_REVENUE': '2300',
        'COMMISSION_PAYABLE': '2400',
        'RETAINED_EARNINGS': '3000',
        'SHARE_CAPITAL': '3100',
        'SALE_PROCEEDS': '4000',
        'RENTAL_INCOME': '4100',
        'COMMISSION_INCOME': '4200',
        'MANAGEMENT_FEES': '4300',
        'OTHER_INCOME': '4900',
        'COST_OF_SALES': '5000',
        'COMMISSION_EXPENSE': '5100',
        'PROPERTY_EXPENSES': '5200',
        'MAINTENANCE': '5300',
        'RATES_AND_LEVIES': '5400',
        'INSURANCE': '5500',
        'BOND_INTEREST': '5600',
        'DEPRECIATION': '5700',
        'ADMIN_EXPENSES': '5800',
        'SALARIES': '5900',
    }

    def __init__(self, user=None):
        self.user = user
        self._reference_counter = None
        self._posting_profile = None

    @property
    def posting_profile(self):
        """Lazily load the default posting profile."""
        if self._posting_profile is None:
            self._posting_profile = PostingProfile.objects.filter(is_default=True).first()
        return self._posting_profile

    def get_account(self, account_key: str) -> str:
        """
        Get the GL account code for a system account key.
        Checks the active PostingProfile first, then falls back to DEFAULT_ACCOUNTS.
        """
        profile = self.posting_profile
        if profile:
            # Map key to profile field name
            field_name = account_key.lower()
            if hasattr(profile, field_name):
                account = getattr(profile, field_name)
                if account:
                    return account.code
        
        return self.DEFAULT_ACCOUNTS.get(account_key)

    @property
    def ACCOUNTS(self):
        """Legacy compatibility property that provides a dict-like interface for lookups."""
        class AccountProxy:
            def __init__(self, service):
                self.service = service
            def __getitem__(self, key):
                return self.service.get_account(key)
        return AccountProxy(self)

    def _generate_reference(self, journal_code: str) -> str:
        """Generate unique journal entry reference using NumberSequenceService."""
        from apps.core.services.number_sequence import NumberSequenceService  # type: ignore
        return NumberSequenceService.get_next_number(f"Journal {journal_code}", prefix=f"{journal_code}-", padding=6)

    def _get_fiscal_period(self, entry_date: date) -> FiscalPeriod:
        """Find the open fiscal period for a given date."""
        try:
            period = FiscalPeriod.objects.select_related('fiscal_year').get(
                start_date__lte=entry_date,
                end_date__gte=entry_date,
            )
        except FiscalPeriod.DoesNotExist:
            raise AccountingError(
                f'No fiscal period found for date {entry_date}. '
                f'Please ensure fiscal periods are configured.'
            )

        if not period.is_open_for_posting():
            raise AccountingError(
                f'Fiscal period "{period.name}" is {period.status}. '
                f'Cannot post to a locked or closed period.'
            )

        return period

    def _get_account(self, code: str) -> ChartOfAccount:
        """Fetch a GL account by code, raising a clear error if not found."""
        try:
            return ChartOfAccount.objects.get(code=code, is_active=True)
        except ChartOfAccount.DoesNotExist:
            raise AccountingError(
                f'GL Account with code "{code}" not found or inactive. '
                f'Please verify the Chart of Accounts.'
            )

    def _get_journal(self, code: str) -> Journal:
        """Fetch a journal by code."""
        try:
            return Journal.objects.get(code=code, is_active=True)
        except Journal.DoesNotExist:
            raise AccountingError(f'Journal "{code}" not found.')

    @transaction.atomic
    def post_entry(self, posting_data: PostingData, journal_code: str = 'GJ') -> JournalEntry:
        """
        Core posting method. Creates and immediately posts a journal entry.

        This is the ONLY way entries should be created for auto-posting.
        Performs all validations before committing to the database.

        Args:
            posting_data: PostingData object with all lines
            journal_code: Journal to post to (default: General Journal 'GJ')

        Returns:
            Posted JournalEntry instance

        Raises:
            AccountingError: If validation fails
        """
        logger.info(
            f'Posting journal entry: {posting_data.description} '
            f'dated {posting_data.entry_date} via {journal_code}'
        )

        # ─── Validation ──────────────────────────────────────────────────────

        if not posting_data.lines:
            raise AccountingError('Cannot post an entry with no lines.')

        if not posting_data.is_balanced():
            raise AccountingError(
                f'Journal entry is not balanced. '
                f'Debits: {posting_data.total_debits()}, '
                f'Credits: {posting_data.total_credits()}. '
                f'Difference: {posting_data.total_debits() - posting_data.total_credits()}'
            )

        if posting_data.total_debits() <= 0:
            raise AccountingError('Journal entry amount must be greater than zero.')

        # ─── Resolve Dependencies ─────────────────────────────────────────────

        journal = self._get_journal(journal_code)
        fiscal_period = self._get_fiscal_period(posting_data.entry_date)
        reference = self._generate_reference(journal.code)

        # Pre-fetch all accounts to fail fast before creating the entry
        account_map = {}
        for line in posting_data.lines:
            code = str(line['account_code'])
            if code not in account_map:
                account_map[code] = self._get_account(code)

        # Get currency
        try:
            from apps.core.models import Currency  # type: ignore
            currency = Currency.objects.get(code=posting_data.currency_code)
        except Currency.DoesNotExist:
            raise AccountingError(f"Currency {posting_data.currency_code} not found.")

        # ─── Create Journal Entry (header) ────────────────────────────────────

        entry = JournalEntry(
            reference=reference,
            journal=journal,
            fiscal_period=fiscal_period,
            currency=currency,
            exchange_rate=posting_data.exchange_rate,
            entry_type=JournalEntry.EntryType.MANUAL if not posting_data.source_module
                       else self._infer_entry_type(posting_data.source_module),
            entry_date=posting_data.entry_date,
            description=posting_data.description,
            source_module=posting_data.source_module,
            source_id=posting_data.source_id,
            source_reference=posting_data.source_reference,
            status=JournalEntry.EntryStatus.DRAFT,  # Will be posted below
        )
        if self.user:
            entry.created_by = self.user

        entry.save()

        # ─── Create Journal Lines ─────────────────────────────────────────────

        lines_to_create = []
        for line_data in posting_data.lines:
            account = account_map[str(line_data['account_code'])]
            # Skip direct posting check for system-generated entries (modular postings)
            if not account.allow_direct_posting and not posting_data.source_module:
                raise AccountingError(
                    f'Account {account.code} does not allow direct posting. '
                    f'Use a sub-account or relevant module.'
                )

            # Check for manual entry restriction
            if not account.allow_manual_entry and entry.entry_type == JournalEntry.EntryType.MANUAL:
                raise AccountingError(
                    f'Account {account.code} does not allow manual journal entries.'
                )

            # Check for transaction type restrictions
            if account.allowed_transaction_types and entry.entry_type not in account.allowed_transaction_types:
                raise AccountingError(
                    f'Account {account.code} does not allow transactions of type: {entry.entry_type}'
                )
            line_amount = line_data['amount']
            if not isinstance(line_amount, Decimal):
                line_amount = Decimal(str(line_amount))
                
            lines_to_create.append(JournalLine(
                entry=entry,
                account=account,
                side=line_data['side'],
                amount_currency=line_amount,
                amount=(line_amount * entry.exchange_rate).quantize(Decimal('0.01')),
                description=line_data['description'],
                property_ref=line_data.get('property_ref'),
                contact_ref=line_data.get('contact_ref'),
                supplier_ref=line_data.get('supplier_ref'),
            ))

        JournalLine.objects.bulk_create(lines_to_create)

        # ─── Post the Entry ───────────────────────────────────────────────────

        entry.status = JournalEntry.EntryStatus.POSTED
        entry.posted_at = timezone.now()
        entry.posted_by = self.user
        entry.save(update_fields=['status', 'posted_at', 'posted_by'])

        # ─── Update Account Balances ──────────────────────────────────────────

        self._update_account_balances(lines_to_create)

        logger.info(f'Successfully posted entry {reference} | DR: {posting_data.total_debits()}')

        return entry

    @transaction.atomic
    def post_saved_entry(self, entry: JournalEntry) -> JournalEntry:
        """
        Post a previously saved DRAFT journal entry.
        Validates the entry (balance, period) and updates account balances.
        """
        if entry.status != JournalEntry.EntryStatus.DRAFT:
            raise AccountingError('Only draft entries can be posted.')

        if not entry.is_balanced():
            raise AccountingError(
                f'Journal entry is not balanced. '
                f'DR={entry.get_total_debits()}, CR={entry.get_total_credits()}'
            )

        # Re-verify fiscal period
        self._get_fiscal_period(entry.entry_date)

        # Post the Entry
        entry.status = JournalEntry.EntryStatus.POSTED
        entry.posted_at = timezone.now()
        entry.posted_by = self.user
        entry.save(update_fields=['status', 'posted_at', 'posted_by'])

        # Update Account Balances
        self._update_account_balances(entry.lines.all())

        logger.info(f'Successfully posted saved entry {entry.reference}')
        return entry

    def _update_account_balances(self, lines):
        """
        Update the denormalized balance on each affected account.
        Uses F() expressions for atomic database-level updates.
        """
        from django.db.models import F  # type: ignore

        for line in lines:
            account = line.account
            # Determine if this line increases or decreases the normal balance
            if line.side == 'debit':
                if account.account_type in ['asset', 'expense']:
                    # Debit increases asset/expense
                    ChartOfAccount.objects.filter(pk=account.pk).update(
                        current_balance=F('current_balance') + line.amount
                    )
                else:
                    # Debit decreases liability/equity/revenue
                    ChartOfAccount.objects.filter(pk=account.pk).update(
                        current_balance=F('current_balance') - line.amount
                    )
            else:  # credit
                if account.account_type in ['liability', 'equity', 'revenue']:
                    # Credit increases liability/equity/revenue
                    ChartOfAccount.objects.filter(pk=account.pk).update(
                        current_balance=F('current_balance') + line.amount
                    )
                else:
                    # Credit decreases asset/expense
                    ChartOfAccount.objects.filter(pk=account.pk).update(
                        current_balance=F('current_balance') - line.amount
                    )

    def _infer_entry_type(self, source_module: str) -> str:
        """Map source module name to JournalEntry entry_type."""
        mapping = {
            'sales': JournalEntry.EntryType.SALES,
            'rental': JournalEntry.EntryType.RENTAL,
            'commission': JournalEntry.EntryType.COMMISSION,
            'payroll': JournalEntry.EntryType.PAYROLL,
        }
        entry_type = mapping.get(source_module, JournalEntry.EntryType.MANUAL)
        return str(entry_type)

    # ─── Module-Specific Posting Methods ──────────────────────────────────────

    @transaction.atomic
    def post_sale_transaction(self, sale_transaction) -> JournalEntry:
        """
        Post accounting entries for a completed property sale.

        Debits:
          Bank/Trust Account (full proceeds)
        Credits:
          Sale Proceeds (revenue)
          VAT Payable (15% of commission/fees)
          Commission Payable (agent commission owed)
        """
        from apps.sales.models import SaleTransaction  # type: ignore

        amount = sale_transaction.sale_price
        commission_amount = sale_transaction.commission_amount or Decimal('0.00')
        vat_amount = commission_amount * Decimal('0.15')  # 15% VAT on commission

        posting = PostingData(
            description=f'Property Sale - {sale_transaction.property.reference_number}',
            entry_date=sale_transaction.transfer_date or sale_transaction.created_at.date(),
            source_module='sales',
            source_id=sale_transaction.id,
            source_reference=sale_transaction.sale_reference,
        )

        # Debit bank with full proceeds
        posting.add_debit(
            self.ACCOUNTS['BANK_TRUST'],
            amount,
            f'Sale proceeds - {sale_transaction.property.reference_number}',
            property_ref=sale_transaction.property,
        )

        # Credit revenue
        posting.add_credit(
            self.ACCOUNTS['SALE_PROCEEDS'],
            amount - commission_amount,
            f'Sale revenue - {sale_transaction.property.reference_number}',
            property_ref=sale_transaction.property,
        )

        # Credit commission payable
        if commission_amount > 0:
            posting.add_credit(
                self.ACCOUNTS['COMMISSION_PAYABLE'],
                commission_amount - vat_amount,
                f'Commission payable - {sale_transaction.sale_reference}',
            )

            # Credit VAT
            posting.add_credit(
                self.ACCOUNTS['VAT_PAYABLE'],
                vat_amount,
                f'Output VAT on commission - {sale_transaction.sale_reference}',
            )

        return self.post_entry(posting, journal_code='SJ')  # Sales Journal

    @transaction.atomic
    def post_rental_invoice(self, lease, amount: Decimal, invoice_ref: str) -> JournalEntry:
        """
        Post monthly rental income entries.

        Debit: Accounts Receivable (tenant owes rent)
        Credit: Rental Income
        Credit: VAT Payable (if applicable)
        """
        vat_amount = amount * Decimal('0.15') if lease.vat_applicable else Decimal('0.00')
        net_amount = amount - vat_amount

        posting = PostingData(
            description=f'Rental Invoice - {lease.tenant.full_name} - {invoice_ref}',
            entry_date=lease.next_invoice_date or date.today(),
            source_module='rental',
            source_id=lease.id,
            source_reference=invoice_ref,
        )

        posting.add_debit(
            self.ACCOUNTS['ACCOUNTS_RECEIVABLE'],
            amount,
            f'Rent due: {invoice_ref}',
            property_ref=lease.property,
            contact_ref=lease.tenant,
        )

        posting.add_credit(
            self.ACCOUNTS['RENTAL_INCOME'],
            net_amount,
            f'Rental income: {invoice_ref}',
            property_ref=lease.property,
        )

        if vat_amount > 0:
            posting.add_credit(
                self.ACCOUNTS['VAT_PAYABLE'],
                vat_amount,
                f'Output VAT: {invoice_ref}',
            )

        return self.post_entry(posting, journal_code='RJ')  # Rental Journal

    @transaction.atomic
    def post_commission_payment(self, commission_record) -> JournalEntry:
        """
        Post agent commission payment.

        Debit: Commission Payable (clear the liability)
        Credit: Bank Account (cash paid out)
        """
        amount = commission_record.net_commission

        posting = PostingData(
            description=f'Commission Payment - {commission_record.agent.full_name}',
            entry_date=commission_record.payment_date or date.today(),
            source_module='commission',
            source_id=commission_record.id,
            source_reference=commission_record.reference,
        )

        posting.add_debit(
            self.ACCOUNTS['COMMISSION_PAYABLE'],
            amount,
            f'Commission payout: {commission_record.reference}',
        )

        posting.add_credit(
            self.ACCOUNTS['BANK_MAIN'],
            amount,
            f'Commission paid: {commission_record.reference}',
        )

        return self.post_entry(posting, journal_code='CJ')  # Commission Journal

    @transaction.atomic
    def post_deposit_received(self, lease, deposit_amount: Decimal) -> JournalEntry:
        """
        Post security deposit receipt. This is a balance sheet entry only.

        Debit: Bank Account (cash received)
        Credit: Tenant Deposits Liability (owed back to tenant)
        """
        posting = PostingData(
            description=f'Security Deposit - {lease.tenant.full_name}',
            entry_date=date.today(),
            source_module='rental',
            source_id=lease.id,
            source_reference=f'DEP-{lease.lease_number}',
        )

        posting.add_debit(self.ACCOUNTS['BANK_TRUST'], deposit_amount, 'Deposit received')
        posting.add_credit(self.ACCOUNTS['TENANT_DEPOSITS'], deposit_amount, 'Deposit liability')

        return self.post_entry(posting, journal_code='RJ')

    @transaction.atomic
    def post_supplier_invoice(self, invoice) -> JournalEntry:
        """
        Post a supplier invoice to AP and appropriate expense accounts.
        Credit: Accounts Payable
        Debit: Expense Accounts (per line)
        Debit: VAT Receivable (if applicable)
        """
        posting = PostingData(
            description=f'Supplier Invoice - {invoice.supplier.name} - {invoice.invoice_number}',
            entry_date=invoice.invoice_date,
            source_module='ap',
            source_id=invoice.id,
            source_reference=invoice.invoice_number,
        )

        # Credit AP with total amount
        ap_account = invoice.supplier.ap_account.code if invoice.supplier.ap_account else self.ACCOUNTS['ACCOUNTS_PAYABLE']
        posting.add_credit(
            ap_account,
            invoice.total_amount,
            f'Invoice {invoice.invoice_number}',
            supplier_ref=invoice.supplier
        )

        # Debit expenses per line
        for line in invoice.lines.all():
            # Debit expense with net amount (line_total - tax_amount)
            posting.add_debit(
                line.expense_account.code,
                line.line_total - line.tax_amount,
                line.description,
            )
            
            # Debit VAT if applicable
            if line.tax_amount > 0:
                # Use tax-specific account if configured, otherwise fallback to system default
                vat_account = line.tax_code.paid_account.code if (line.tax_code and line.tax_code.paid_account) else self.ACCOUNTS['VAT_RECEIVABLE']
                posting.add_debit(
                    vat_account,
                    line.tax_amount,
                    f'Input VAT - {line.description}',
                )

        # Assuming PJ for Purchases Journal
        entry = self.post_entry(posting, journal_code='PJ')
        
        # Log Tax Transactions for reporting
        tax_trans = []
        for line in invoice.lines.filter(tax_amount__gt=0):
            tax_trans.append(TaxTransaction(
                tax_code=line.tax_code,
                transaction_type=TaxTransaction.TransactionType.INPUT,
                date=invoice.invoice_date,
                gross_amount=line.line_total,
                tax_amount=line.tax_amount,
                net_amount=line.line_total - line.tax_amount,
                journal_entry=entry,
                reference=invoice.invoice_number
            ))
        if tax_trans:
            TaxTransaction.objects.bulk_create(tax_trans)
            
        return entry

    @transaction.atomic
    def post_supplier_payment(self, payment) -> JournalEntry:
        """
        Post a supplier payment.
        Debit: Accounts Payable
        Credit: Bank Account
        """
        posting = PostingData(
            description=f'Supplier Payment - {payment.supplier.name}',
            entry_date=payment.payment_date,
            source_module='ap',
            source_id=payment.id,
            source_reference=payment.payment_reference,
        )

        ap_account = payment.supplier.ap_account.code if payment.supplier.ap_account else self.ACCOUNTS['ACCOUNTS_PAYABLE']
        posting.add_debit(
            ap_account,
            payment.amount,
            f'Payment - {payment.payment_reference}',
            supplier_ref=payment.supplier
        )

        posting.add_credit(
            payment.bank_account.gl_account.code,
            payment.amount,
            f'Payment {payment.payment_reference}',
        )

        return self.post_entry(posting, journal_code='GJ')

    @transaction.atomic
    def post_customer_invoice(self, invoice) -> JournalEntry:
        """
        Post a customer invoice to AR and appropriate revenue accounts.
        Debit: Accounts Receivable
        Credit: Revenue Accounts (per line)
        Credit: VAT Payable (if applicable)
        """
        posting = PostingData(
            description=f'Customer Invoice - {invoice.customer.name} - {invoice.invoice_number}',
            entry_date=invoice.invoice_date,
            source_module='ar',
            source_id=invoice.id,
            source_reference=invoice.invoice_number,
        )

        # Debit AR with total amount
        posting.add_debit(
            self.ACCOUNTS['ACCOUNTS_RECEIVABLE'],
            invoice.total_amount,
            f'Invoice {invoice.invoice_number}',
            contact_ref=invoice.customer.contact_link,
        )

        # Credit revenue per line
        for line in invoice.lines.all():
            # Credit revenue with net amount (line_total - tax_amount)
            posting.add_credit(
                line.revenue_account.code,
                line.line_total - line.tax_amount,
                line.description,
            )
            
            # Credit VAT if applicable
            if line.tax_amount > 0:
                # Use tax-specific account if configured, otherwise fallback to system default
                vat_account = line.tax_code.collected_account.code if (line.tax_code and line.tax_code.collected_account) else self.ACCOUNTS['VAT_PAYABLE']
                posting.add_credit(
                    vat_account,
                    line.tax_amount,
                    f'Output VAT - {line.description}',
                )

        entry = self.post_entry(posting, journal_code='SJ')  # Sales Journal
        
        # Log Tax Transactions for reporting
        tax_trans = []
        for line in invoice.lines.filter(tax_amount__gt=0):
            tax_trans.append(TaxTransaction(
                tax_code=line.tax_code,
                transaction_type=TaxTransaction.TransactionType.OUTPUT,
                date=invoice.invoice_date,
                gross_amount=line.line_total,
                tax_amount=line.tax_amount,
                net_amount=line.line_total - line.tax_amount,
                journal_entry=entry,
                reference=invoice.invoice_number
            ))
        if tax_trans:
            TaxTransaction.objects.bulk_create(tax_trans)
            
        return entry

    @transaction.atomic
    def post_customer_receipt(self, receipt) -> JournalEntry:
        """
        Post a customer receipt and allocate to outstanding invoices (FIFO).
        Debit: Bank Account
        Credit: Accounts Receivable
        """
        posting = PostingData(
            description=f'Customer Receipt - {receipt.customer.name}',
            entry_date=receipt.receipt_date,
            source_module='ar',
            source_id=receipt.id,
            source_reference=receipt.receipt_reference,
        )

        posting.add_debit(
            receipt.bank_account.gl_account.code,
            receipt.amount,
            f'Receipt {receipt.receipt_reference}',
        )

        posting.add_credit(
            self.ACCOUNTS['ACCOUNTS_RECEIVABLE'],
            receipt.amount,
            f'Receipt from {receipt.customer.name}',
            contact_ref=receipt.customer.contact_link,
        )

        entry = self.post_entry(posting, journal_code='GJ')

        # FIFO Allocation to Invoices
        from apps.finance.models import CustomerInvoice
        remaining_amount = receipt.amount
        
        # Fetch unpaid/partially paid invoices for this customer, oldest first
        outstanding_invoices = CustomerInvoice.objects.filter(
            customer=receipt.customer,
            status__in=[
                CustomerInvoice.InvoiceStatus.POSTED,
                CustomerInvoice.InvoiceStatus.PARTIAL,
                CustomerInvoice.InvoiceStatus.OVERDUE
            ]
        ).order_by('invoice_date', 'created_at')

        for invoice in outstanding_invoices:
            if remaining_amount <= 0:
                break
            
            can_pay = invoice.total_amount - invoice.amount_paid
            payment_allocation = min(remaining_amount, can_pay)
            
            invoice.amount_paid += payment_allocation
            remaining_amount -= payment_allocation
            
            # Update Status
            if invoice.amount_paid >= invoice.total_amount:
                invoice.status = CustomerInvoice.InvoiceStatus.PAID
            else:
                invoice.status = CustomerInvoice.InvoiceStatus.PARTIAL
            invoice.save(update_fields=['amount_paid', 'status'])
        
        return entry

    @transaction.atomic
    def record_rental_payment_with_deductions(self, rental_payment, customer, bank_account, wht_account, deposit_account) -> JournalEntry:
        """
        Specialized posting for rental payments that include withholding tax 
        and deductions from tenant balance.
        """
        total_value = rental_payment.amount + rental_payment.withholding_tax + rental_payment.amount_from_balance
        
        posting = PostingData(
            description=f'Rental Payment - {rental_payment.invoice.lease.tenant.full_name}',
            entry_date=rental_payment.payment_date,
            source_module='rental',
            source_id=rental_payment.id,
            source_reference=rental_payment.reference,
        )

        # 1. Debit Bank (Cash portion)
        if rental_payment.amount > 0:
            posting.add_debit(
                bank_account.gl_account.code,
                rental_payment.amount,
                f'Cash received: {rental_payment.reference}',
            )

        # 2. Debit Withholding Tax Asset
        if rental_payment.withholding_tax > 0:
            posting.add_debit(
                wht_account.code,
                rental_payment.withholding_tax,
                f'Withholding tax deducted: {rental_payment.reference}',
            )

        # 3. Debit Tenant Deposit/Credit Liability
        if rental_payment.amount_from_balance > 0:
            posting.add_debit(
                deposit_account.code,
                rental_payment.amount_from_balance,
                f'Utilized from tenant balance: {rental_payment.reference}',
                contact_ref=customer.contact_link
            )

        # 4. Credit Accounts Receivable (Full value)
        posting.add_credit(
            self.ACCOUNTS['ACCOUNTS_RECEIVABLE'],
            total_value,
            f'Total payment applied: {rental_payment.reference}',
            contact_ref=customer.contact_link,
        )

        entry = self.post_entry(posting, journal_code='GJ')
        return entry

    @transaction.atomic
    def create_reversal(self, entry: JournalEntry) -> JournalEntry:
        """
        Create a full reversal of a posted entry.
        Swaps all debits to credits and vice versa.
        Links back to the original entry.
        """
        if entry.status != JournalEntry.EntryStatus.POSTED:
            raise AccountingError('Only posted entries can be reversed.')

        if entry.is_reversal:
            raise AccountingError('Cannot reverse a reversal entry.')

        posting = PostingData(
            description=f'REVERSAL: {entry.description}',
            entry_date=date.today(),
            source_module=entry.source_module,
            currency_code=entry.currency.code,
            exchange_rate=entry.exchange_rate,
        )

        # Swap all lines
        for line in entry.lines.all():
            reversed_side = 'credit' if line.side == 'debit' else 'debit'
            posting.lines.append({
                'account_code': line.account.code,
                'side': reversed_side,
                'amount': line.amount_currency,
                'description': f'Reversal: {line.description}',
                'property_ref': line.property_ref,
                'contact_ref': line.contact_ref,
            })

        reversal = self.post_entry(posting, journal_code=entry.journal.code)
        reversal.is_reversal = True
        reversal.reversed_entry = entry
        reversal.save(update_fields=['is_reversal', 'reversed_entry'])

        # Mark original as reversed
        JournalEntry.objects.filter(pk=entry.pk).update(status=JournalEntry.EntryStatus.REVERSED)

        return reversal

    def generate_trial_balance(self, fiscal_period: FiscalPeriod) -> dict:
        """
        Generate Trial Balance for a fiscal period.
        Returns structured data with account balances.
        """
        from django.db.models import Sum, Case, When, Q  # type: ignore

        # Aggregate debits and credits per account for the period
        lines = JournalLine.objects.filter(
            entry__fiscal_period=fiscal_period,
            entry__status=JournalEntry.EntryStatus.POSTED,
        ).values(
            'account__code', 'account__name', 'account__account_type'
        ).annotate(
            total_debit=Sum('amount', filter=Q(side='debit')),
            total_credit=Sum('amount', filter=Q(side='credit')),
        ).order_by('account__code')

        accounts = []
        total_debit = Decimal('0.00')
        total_credit = Decimal('0.00')

        for line in lines:
            dr = line['total_debit'] or Decimal('0.00')
            cr = line['total_credit'] or Decimal('0.00')
            net = dr - cr
            accounts.append({
                'code': line['account__code'],
                'name': line['account__name'],
                'type': line['account__account_type'],
                'total_debit': str(dr),
                'total_credit': str(cr),
                'net_balance': str(net),
            })
            total_debit += dr
            total_credit += cr

        return {
            'period': str(fiscal_period),
            'accounts': accounts,
            'total_debit': str(total_debit),
            'total_credit': str(total_credit),
            'is_balanced': total_debit == total_credit,
        }
