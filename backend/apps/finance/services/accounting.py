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
                  property_ref=None, contact_ref=None, supplier_ref=None, cost_center=None):
        """Add a debit line to this posting."""
        return self._add('debit', account_code, amount, description, property_ref, contact_ref,
                         supplier_ref, cost_center)

    def add_credit(self, account_code: str, amount: Decimal, description: str = '',
                   property_ref=None, contact_ref=None, supplier_ref=None, cost_center=None):
        """Add a credit line to this posting."""
        return self._add('credit', account_code, amount, description, property_ref, contact_ref,
                         supplier_ref, cost_center)

    def add(self, side: str, account_code: str, amount: Decimal, description: str = '', **refs):
        """Add a line on `side` ('debit'/'credit'); a negative amount flips the side."""
        amount = Decimal(str(amount))
        if amount < 0:
            side, amount = ('credit' if side == 'debit' else 'debit'), -amount
        if amount == 0:
            return self
        return self._add(side, account_code, amount, description, refs.get('property_ref'),
                         refs.get('contact_ref'), refs.get('supplier_ref'), refs.get('cost_center'))

    def _add(self, side, account_code, amount, description, property_ref, contact_ref, supplier_ref,
             cost_center):
        self.lines.append({
            'account_code': account_code,
            'side': side,
            'amount': Decimal(str(amount)),
            'description': description,
            'property_ref': property_ref,
            'contact_ref': contact_ref,
            'supplier_ref': supplier_ref,
            'cost_center': cost_center,
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
        'SALE_REVENUE': '4000',
        'COST_OF_SALES': '5000',
        'PROPERTY_INVENTORY': '1510',
        'COMMISSION_EXPENSE': '5100',
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
        
        code = self.DEFAULT_ACCOUNTS.get(account_key)
        if not code:
            raise AccountingError(f"System configuration error: GL account key '{account_key}' is not mapped and has no default.")
        return code

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

    def _get_fiscal_period(self, entry_date: date, allow_locked: bool = False) -> FiscalPeriod:
        """
        Find the open fiscal period for a given date.

        allow_locked lets system closing entries land in a locked/closed
        period of a fiscal year that is itself still open.
        """
        # Try to find exactly one period that is currently open
        periods = FiscalPeriod.objects.select_related('fiscal_year').filter(
            start_date__lte=entry_date,
            end_date__gte=entry_date,
        )

        if not periods.exists():
            raise AccountingError(
                f'No fiscal period found for date {entry_date}. '
                f'Please ensure fiscal periods are configured.'
            )

        # Prioritize OPEN periods if there are multiple (due to duplicates/overlaps)
        period = periods.filter(status=FiscalPeriod.PeriodStatus.OPEN).first()
        
        # Fallback to any period if none are open (though it will fail the check below)
        if not period:
            period = periods.first()

        if allow_locked and not period.fiscal_year.is_closed:
            return period

        if not period.is_open_for_posting():
            raise AccountingError(
                f'Fiscal period "{period.name}" is "{period.status}". '
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

    def _default_tax_code(self) -> TaxCode:
        """Taxed lines without a code are reported under the standard rate."""
        code = TaxCode.objects.filter(code='STD', is_active=True).first()
        if code is None:
            raise AccountingError('A taxed line has no tax code and no active STD tax code exists.')
        return code

    def _get_journal(self, code: str) -> Journal:
        """Fetch a journal by code."""
        try:
            return Journal.objects.get(code=code, is_active=True)
        except Journal.DoesNotExist:
            raise AccountingError(f'Journal "{code}" not found.')

    @transaction.atomic
    def post_entry(self, posting_data: PostingData, journal_code: str = 'GJ',
                   allow_locked_period: bool = False) -> JournalEntry:
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
        fiscal_period = self._get_fiscal_period(posting_data.entry_date, allow_locked=allow_locked_period)
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
                
            if account.requires_cost_center and not line_data.get('cost_center'):
                raise AccountingError(f'Account {account.code} requires a cost center on every posting.')

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
                cost_center=line_data.get('cost_center'),
            ))

        self._absorb_rounding(lines_to_create)
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

    @staticmethod
    def _absorb_rounding(lines):
        """
        Foreign-currency entries balance in document currency, but converting
        each line to base and rounding to cents can leave a cent or two over.
        Put that residue on the largest line so the base amounts balance too.
        """
        dr = sum(ln.amount for ln in lines if ln.side == 'debit')
        cr = sum(ln.amount for ln in lines if ln.side == 'credit')
        diff = dr - cr
        if diff == 0:
            return
        if abs(diff) > Decimal('0.05') * max(len(lines), 1):
            raise AccountingError(f'Entry does not balance in base currency (difference {diff}).')
        largest = max(lines, key=lambda ln: ln.amount)
        largest.amount += -diff if largest.side == 'debit' else diff

    # Statuses from which an entry may be posted:
    #   DRAFT    - single-entry posting (JournalEntryViewSet.post_entry)
    #   APPROVED - batch posting after maker/checker approval
    # Previously only DRAFT was accepted, so approved batches could never post.
    POSTABLE_STATUSES = (JournalEntry.EntryStatus.DRAFT, JournalEntry.EntryStatus.APPROVED)

    @transaction.atomic
    def post_saved_entry(self, entry: JournalEntry) -> JournalEntry:
        """
        Post a previously saved DRAFT or APPROVED journal entry.
        Validates the entry (balance, period) and updates account balances.

        Atomic, and locks the entry row so two concurrent requests can't post
        the same entry twice (which would double the account balances).
        """
        entry = JournalEntry.objects.select_for_update().get(pk=entry.pk)
        if entry.status not in self.POSTABLE_STATUSES:
            raise AccountingError(
                f'Entry {entry.reference} is {entry.status}; only draft or approved entries can be posted.'
            )

        if not entry.is_balanced():
            raise AccountingError(
                f'Journal entry is not balanced. '
                f'DR={entry.get_total_debits()}, CR={entry.get_total_credits()}'
            )

        # Re-verify fiscal period
        self._get_fiscal_period(entry.entry_date)

        missing_dimension = entry.lines.filter(account__requires_cost_center=True, cost_center__isnull=True) \
            .values_list('account__code', flat=True).first()
        if missing_dimension:
            raise AccountingError(f'Account {missing_dimension} requires a cost center on every posting.')

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

    @staticmethod
    def _agent_split_rate(deal_amount) -> Decimal:
        """
        Agent's % of the company commission from the default commission
        structure (highest tier reached by the deal, else its base rate).
        Without a configured structure the agent gets 100%, as before.
        """
        from apps.commissions.models import CommissionStructure  # type: ignore

        structure = CommissionStructure.objects.filter(is_default=True).prefetch_related('tiers').first()
        if structure is None:
            return Decimal('100.00')
        tier = [t for t in structure.tiers.all() if t.threshold_amount <= deal_amount]
        if structure.calculation_type == CommissionStructure.CalculationType.TIERED and tier:
            return tier[-1].rate_percentage
        return structure.base_rate or Decimal('100.00')

    @transaction.atomic
    def post_sale_transaction(self, sale_transaction) -> JournalEntry:
        """
        Post accounting entries for a completed property sale using an automated workflow.
        
        Steps:
        1. Raise Customer Invoice (Debit AR, Credit Revenue)
        2. Record Commission (Liability to agent)
        3. Recognize Cost of Sale (Debit COS, Credit Inventory)
        """
        from apps.finance.models import CustomerInvoice, CustomerInvoiceLine, CustomerProfile  # type: ignore
        from apps.commissions.models import CommissionRecord  # type: ignore
        from decimal import Decimal

        # Principal sale (company stock): the buyer is invoiced the sale price
        # and cost of sale is recognised. Agency sale (brokered): the property
        # isn't ours, so only our commission is revenue, billed to the seller.
        agency = sale_transaction.get_effective_sale_type() == sale_transaction.SaleType.AGENCY
        if agency:
            if not sale_transaction.seller_id:
                raise AccountingError('A brokered sale needs the seller, who is invoiced the commission.')
            if not sale_transaction.commission_amount:
                sale_transaction.calculate_commission()
                sale_transaction.save(update_fields=['commission_amount'])
            bill_to, amount = sale_transaction.seller, sale_transaction.commission_amount
            revenue_key, line_label = 'COMMISSION_INCOME', 'Sales commission'
        else:
            bill_to, amount = sale_transaction.buyer, sale_transaction.sale_price
            revenue_key, line_label = 'SALE_REVENUE', 'Property Sale'

        # 1. Create/Get Customer Profile
        customer_profile, _ = CustomerProfile.objects.get_or_create(
            contact_link=bill_to,
            defaults={
                'name': bill_to.full_name,
                'ar_account_id': self._get_account(self.ACCOUNTS['ACCOUNTS_RECEIVABLE']).id
            }
        )

        # 2. Create/Get Customer Invoice
        invoice = CustomerInvoice.objects.filter(
            reference=sale_transaction.sale_reference,
            customer=customer_profile
        ).first()

        if not invoice:
            invoice = CustomerInvoice.objects.create(
                customer=customer_profile,
                invoice_date=sale_transaction.transfer_date or date.today(),
                due_date=sale_transaction.transfer_date or date.today(),
                currency=sale_transaction.currency,
                subtotal=amount,
                total_amount=amount,
                reference=sale_transaction.sale_reference,
                status=CustomerInvoice.InvoiceStatus.DRAFT
            )

        # Add Invoice Line if not exists
        if not invoice.lines.filter(description__icontains=sale_transaction.property.reference_number).exists():
            CustomerInvoiceLine.objects.create(
                invoice=invoice,
                description=f"{line_label}: {sale_transaction.property.reference_number}",
                revenue_account=self._get_account(self.ACCOUNTS[revenue_key]),
                unit_price=amount,
                line_total=amount,
                property_ref=sale_transaction.property,
            )

        # Post Invoice (Debits AR, Credits Revenue) if not already posted
        if invoice.status == CustomerInvoice.InvoiceStatus.DRAFT:
            invoice_entry = self.post_customer_invoice(invoice)
            invoice.status = CustomerInvoice.InvoiceStatus.POSTED
            invoice.journal_entry = invoice_entry
            invoice.save()
        else:
            invoice_entry = invoice.journal_entry

        # 3. Create/Get the agent's commission record (none when no agent was
        # involved; this used to crash on the not-null agent column).
        agent = sale_transaction.selling_agent or sale_transaction.listing_agent
        if (sale_transaction.commission_amount or 0) > 0 and agent is not None:
            comm_ref = f"COMM-{sale_transaction.sale_reference}"
            commission = CommissionRecord.objects.filter(reference=comm_ref).first()

            if not commission:
                split = self._agent_split_rate(sale_transaction.sale_price)
                agent_share = (sale_transaction.commission_amount * split / 100).quantize(Decimal('0.01'))
                commission = CommissionRecord.objects.create(
                reference=f"COMM-{sale_transaction.sale_reference}",
                agent=agent,
                transaction_type='sale',
                sale_transaction=sale_transaction,
                property=sale_transaction.property,
                transaction_amount=sale_transaction.sale_price,
                company_commission_rate=sale_transaction.commission_rate,
                company_commission_amount=sale_transaction.commission_amount,
                agent_split_rate=split,
                gross_commission=agent_share,
                net_commission=agent_share,
                status=CommissionRecord.CommissionStatus.APPROVED,
                approved_by=self.user,
                approved_date=date.today()
            )
            if commission.status == CommissionRecord.CommissionStatus.APPROVED and commission.net_commission > 0:
                self.accrue_commission(commission)

        # 4. Recognize Cost of Sale & Update Inventory Status
        property_obj = sale_transaction.property
        # A brokered property was never on our books, so there's no cost of sale.
        cost_amount = Decimal('0.00') if agency else (property_obj.purchase_price or Decimal('0.00'))

        if cost_amount > 0:
            cos_posting = PostingData(
                description=f'Cost Recognition - {property_obj.reference_number}',
                entry_date=sale_transaction.transfer_date or date.today(),
                source_module='sales',
                source_id=sale_transaction.id,
                source_reference=sale_transaction.sale_reference,
            )
            
            cos_posting.add_debit(
                self.ACCOUNTS['COST_OF_SALES'],
                cost_amount,
                f'Cost of sales - {property_obj.reference_number}'
            )
            cos_posting.add_credit(
                self.ACCOUNTS['PROPERTY_INVENTORY'],
                cost_amount,
                f'Inventory reduction - {property_obj.reference_number}'
            )
            
            self.post_entry(cos_posting, journal_code='GJ')

        return invoice_entry

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
    def accrue_commission(self, commission_record) -> JournalEntry:
        """
        Recognise an approved commission as an expense and a liability.

        Debit: Commission Expense
        Credit: Commission Payable (cleared when the agent is paid via payroll
        or post_commission_payment)
        """
        if commission_record.journal_entry_id:
            return commission_record.journal_entry
        amount = commission_record.net_commission
        posting = PostingData(
            description=f'Commission accrual - {commission_record.agent.full_name}',
            entry_date=commission_record.approved_date or date.today(),
            source_module='commission',
            source_id=commission_record.id,
            source_reference=commission_record.reference,
        )
        posting.add_debit(self.ACCOUNTS['COMMISSION_EXPENSE'], amount,
                          f'Commission: {commission_record.reference}',
                          property_ref=commission_record.property)
        posting.add_credit(self.ACCOUNTS['COMMISSION_PAYABLE'], amount,
                           f'Commission payable: {commission_record.reference}')
        entry = self.post_entry(posting, journal_code='CJ')
        commission_record.journal_entry = entry
        commission_record.save(update_fields=['journal_entry'])
        return entry

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
    def post_deposit_received(self, lease, deposit_amount: Decimal, entry_date: date = None) -> JournalEntry:
        """
        Post security deposit receipt. This is a balance sheet entry only.

        Debit: Bank Account (cash received)
        Credit: Tenant Deposits Liability (owed back to tenant)
        """
        posting = PostingData(
            description=f'Security Deposit - {lease.tenant.full_name}',
            entry_date=entry_date or date.today(),
            source_module='rental',
            source_id=lease.id,
            source_reference=f'DEP-{lease.lease_number}',
        )

        posting.add_debit(self.ACCOUNTS['BANK_TRUST'], deposit_amount, 'Deposit received',
                          property_ref=lease.property, contact_ref=lease.tenant)
        posting.add_credit(self.ACCOUNTS['TENANT_DEPOSITS'], deposit_amount, 'Deposit liability',
                           property_ref=lease.property, contact_ref=lease.tenant)

        return self.post_entry(posting, journal_code='RJ')

    @transaction.atomic
    def post_deposit_refund(self, lease, refund_amount: Decimal, applied_to_arrears: Decimal,
                            entry_date: date = None, applied_to_damages: Decimal = Decimal('0')) -> JournalEntry:
        """
        Release a tenant deposit at lease end.

        Debit: Tenant Deposits (full amount released)
        Credit: Bank Trust (cash refunded)
        Credit: Accounts Receivable (portion kept against unpaid rent)
        Credit: damages kept (outgoing inspection) - Owner Funds Held on a
                managed property (the owner pays for the repairs), otherwise
                Recoveries & Recharges income
        """
        total = refund_amount + applied_to_arrears + applied_to_damages
        posting = PostingData(
            description=f'Deposit release - {lease.tenant.full_name}',
            entry_date=entry_date or date.today(),
            source_module='rental',
            source_id=lease.id,
            source_reference=f'DEPREF-{lease.lease_number}',
        )
        posting.add_debit(self.ACCOUNTS['TENANT_DEPOSITS'], total, 'Deposit released',
                          property_ref=lease.property, contact_ref=lease.tenant)
        if refund_amount > 0:
            posting.add_credit(self.ACCOUNTS['BANK_TRUST'], refund_amount, 'Deposit refunded',
                               property_ref=lease.property, contact_ref=lease.tenant)
        if applied_to_arrears > 0:
            posting.add_credit(self.ACCOUNTS['ACCOUNTS_RECEIVABLE'], applied_to_arrears,
                               'Deposit applied to arrears', property_ref=lease.property,
                               contact_ref=lease.tenant)
        if applied_to_damages > 0:
            damages_account = '2210' if lease.property.is_managed else '4920'
            posting.add_credit(damages_account, applied_to_damages, 'Deposit kept for damages',
                               property_ref=lease.property, contact_ref=lease.tenant)

        return self.post_entry(posting, journal_code='RJ')

    # ─── AR / AP documents ────────────────────────────────────────────────────
    # Documents post in their own currency at the rate for the document date;
    # the rate is stored on the document so settlement can compute realised
    # exchange differences. Credit notes post the same lines, sides reversed.

    def _fix_document_rate(self, doc, currency, on):
        from apps.finance.services.fx import get_rate
        doc.exchange_rate = get_rate(currency, on)
        doc.save(update_fields=['exchange_rate'])
        return doc.exchange_rate

    @transaction.atomic
    def post_supplier_invoice(self, invoice) -> JournalEntry:
        """
        Invoice:     Cr AP (total) / Dr expense per line (net) / Dr input VAT
        Credit note: the same, sides reversed; input VAT reported negative.
        """
        from apps.finance.services.fx import currency_code
        from apps.procurement.services import enforce_match, record_invoiced

        if not invoice.is_credit_note:
            enforce_match(invoice)   # PO-linked lines must agree with the PO and the goods received
        sign = Decimal('-1') if invoice.is_credit_note else Decimal('1')
        kind = 'Credit Note' if invoice.is_credit_note else 'Invoice'
        rate = self._fix_document_rate(invoice, invoice.currency, invoice.invoice_date)
        posting = PostingData(
            description=f'Supplier {kind} - {invoice.supplier.name} - {invoice.invoice_number}',
            entry_date=invoice.invoice_date,
            source_module='ap',
            source_id=invoice.id,
            source_reference=invoice.invoice_number,
            currency_code=currency_code(invoice.currency),
            exchange_rate=rate,
        )
        ap_account = invoice.supplier.ap_account.code if invoice.supplier.ap_account else self.ACCOUNTS['ACCOUNTS_PAYABLE']
        posting.add('credit', ap_account, sign * invoice.total_amount, f'{kind} {invoice.invoice_number}',
                    supplier_ref=invoice.supplier)

        lines = list(invoice.lines.select_related('expense_account', 'tax_code__paid_account'))
        for line in lines:
            posting.add('debit', line.expense_account.code, sign * (line.line_total - line.tax_amount),
                        line.description, cost_center=line.cost_center, property_ref=line.property_ref)
            if line.tax_amount > 0:
                vat_account = line.tax_code.paid_account.code if (line.tax_code and line.tax_code.paid_account) \
                    else self.ACCOUNTS['VAT_RECEIVABLE']
                posting.add('debit', vat_account, sign * line.tax_amount, f'Input VAT - {line.description}')

        entry = self.post_entry(posting, journal_code='PJ')
        self._record_tax(lines, TaxTransaction.TransactionType.INPUT, invoice, entry, sign)
        if not invoice.is_credit_note:
            record_invoiced(invoice)
        return entry

    @transaction.atomic
    def post_supplier_payment(self, payment, allocations=None, auto_allocate: bool = True) -> JournalEntry:
        """
        Dr AP / Cr Bank, then settle invoices: the given allocations
        [(invoice, amount)], else oldest-first. Anything left is a prepayment
        (unapplied_amount) that can be applied or refunded later.
        """
        from apps.finance.services.fx import currency_code
        from apps.finance.services.settlement import SettlementService

        rate = self._fix_document_rate(payment, payment.currency, payment.payment_date)
        posting = PostingData(
            description=f'Supplier Payment - {payment.supplier.name}',
            entry_date=payment.payment_date,
            source_module='ap',
            source_id=payment.id,
            source_reference=payment.payment_reference,
            currency_code=currency_code(payment.currency),
            exchange_rate=rate,
        )
        ap_account = payment.supplier.ap_account.code if payment.supplier.ap_account else self.ACCOUNTS['ACCOUNTS_PAYABLE']
        posting.add_debit(ap_account, payment.amount, f'Payment - {payment.payment_reference}',
                          supplier_ref=payment.supplier)
        posting.add_credit(payment.bank_account.gl_account.code, payment.amount, f'Payment {payment.payment_reference}')
        entry = self.post_entry(posting, journal_code='GJ')

        payment.unapplied_amount = payment.amount
        payment.save(update_fields=['unapplied_amount'])
        settlement = SettlementService(user=self.user)
        if allocations:
            settlement.allocate_payment(payment, allocations)
        elif auto_allocate:
            settlement.auto_allocate_payment(payment)
        return entry

    @transaction.atomic
    def post_customer_invoice(self, invoice) -> JournalEntry:
        """
        Invoice:     Dr AR (total) / Cr revenue per line (net) / Cr output VAT
        Credit note: the same, sides reversed; output VAT reported negative.
        """
        from apps.finance.services.fx import currency_code

        sign = Decimal('-1') if invoice.is_credit_note else Decimal('1')
        kind = 'Credit Note' if invoice.is_credit_note else 'Invoice'
        rate = self._fix_document_rate(invoice, invoice.currency, invoice.invoice_date)
        posting = PostingData(
            description=f'Customer {kind} - {invoice.customer.name} - {invoice.invoice_number}',
            entry_date=invoice.invoice_date,
            source_module='ar',
            source_id=invoice.id,
            source_reference=invoice.invoice_number,
            currency_code=currency_code(invoice.currency),
            exchange_rate=rate,
        )
        posting.add('debit', self.ACCOUNTS['ACCOUNTS_RECEIVABLE'], sign * invoice.total_amount,
                    f'{kind} {invoice.invoice_number}', contact_ref=invoice.customer.contact_link)

        lines = list(invoice.lines.select_related('revenue_account', 'tax_code__collected_account'))
        for line in lines:
            posting.add('credit', line.revenue_account.code, sign * (line.line_total - line.tax_amount),
                        line.description, cost_center=line.cost_center, property_ref=line.property_ref)
            if line.tax_amount > 0:
                vat_account = line.tax_code.collected_account.code \
                    if (line.tax_code and line.tax_code.collected_account) else self.ACCOUNTS['VAT_PAYABLE']
                posting.add('credit', vat_account, sign * line.tax_amount, f'Output VAT - {line.description}')

        entry = self.post_entry(posting, journal_code='SJ')
        self._record_tax(lines, TaxTransaction.TransactionType.OUTPUT, invoice, entry, sign)
        return entry

    def _record_tax(self, lines, tax_type, document, entry, sign):
        """VAT return detail, in base currency; credit notes reduce the return."""
        from apps.finance.services.fx import to_base

        rate = document.exchange_rate
        TaxTransaction.objects.bulk_create([
            TaxTransaction(
                tax_code=line.tax_code or self._default_tax_code(),
                transaction_type=tax_type,
                date=document.invoice_date,
                gross_amount=sign * to_base(line.line_total, rate),
                tax_amount=sign * to_base(line.tax_amount, rate),
                net_amount=sign * to_base(line.line_total - line.tax_amount, rate),
                journal_entry=entry,
                reference=document.invoice_number,
            )
            for line in lines if line.tax_amount > 0
        ])

    @transaction.atomic
    def post_customer_receipt(self, receipt, allocate: bool = True, allocations=None) -> JournalEntry:
        """
        Dr Bank / Cr AR, then settle invoices: the given allocations
        [(invoice, amount)], else oldest-first when allocate=True. Anything
        left is customer credit on account (unapplied_amount).

        Pass allocate=False when the caller settles invoices itself.
        """
        from apps.finance.services.fx import currency_code
        from apps.finance.services.settlement import SettlementService

        rate = self._fix_document_rate(receipt, receipt.currency, receipt.receipt_date)
        posting = PostingData(
            description=f'Customer Receipt - {receipt.customer.name}',
            entry_date=receipt.receipt_date,
            source_module='ar',
            source_id=receipt.id,
            source_reference=receipt.receipt_reference,
            currency_code=currency_code(receipt.currency),
            exchange_rate=rate,
        )
        posting.add_debit(receipt.bank_account.gl_account.code, receipt.amount, f'Receipt {receipt.receipt_reference}')
        posting.add_credit(self.ACCOUNTS['ACCOUNTS_RECEIVABLE'], receipt.amount, f'Receipt from {receipt.customer.name}',
                           contact_ref=receipt.customer.contact_link)
        entry = self.post_entry(posting, journal_code='GJ')

        receipt.unapplied_amount = receipt.amount
        receipt.save(update_fields=['unapplied_amount'])
        settlement = SettlementService(user=self.user)
        if allocations:
            settlement.allocate_receipt(receipt, allocations)
        elif allocate:
            settlement.auto_allocate_receipt(receipt)
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

    # ─── Year-End Close ───────────────────────────────────────────────────────

    YEAR_END_SOURCE = 'year_end'

    @transaction.atomic
    def close_fiscal_year(self, fiscal_year: FiscalYear):
        """
        Close a fiscal year: move the year's revenue and expense balances into
        retained earnings with a closing entry dated the last day of the year,
        then close the year and all its periods.

        Returns the closing JournalEntry (None when the year had no P&L).
        Refuses while unposted entries dated in the year remain.
        """
        from django.db.models import Q, Sum  # type: ignore

        fy = FiscalYear.objects.select_for_update().get(pk=fiscal_year.pk)
        if fy.is_closed:
            raise AccountingError(f'{fy.name} is already closed.')

        unposted = JournalEntry.objects.filter(
            entry_date__range=(fy.start_date, fy.end_date),
            status__in=[JournalEntry.EntryStatus.DRAFT, JournalEntry.EntryStatus.PENDING_APPROVAL,
                        JournalEntry.EntryStatus.APPROVED],
        ).count()
        if unposted:
            raise AccountingError(
                f'{unposted} unposted journal entr{"y is" if unposted == 1 else "ies are"} dated in '
                f'{fy.name}. Post or cancel them before closing the year.'
            )

        balances = JournalLine.objects.filter(
            entry__status__in=JournalEntry.LEDGER_STATUSES,
            entry__entry_date__range=(fy.start_date, fy.end_date),
            account__account_type__in=['revenue', 'expense'],
        ).exclude(entry__source_module=self.YEAR_END_SOURCE).values('account__code').annotate(
            dr=Sum('amount', filter=Q(side='debit')),
            cr=Sum('amount', filter=Q(side='credit')),
        ).order_by('account__code')

        posting = PostingData(
            description=f'Year-end close {fy.name}',
            entry_date=fy.end_date,
            source_module=self.YEAR_END_SOURCE,
            source_id=fy.id,
            source_reference=fy.name,
        )
        net_profit = Decimal('0.00')
        for row in balances:
            net_credit = (row['cr'] or Decimal('0')) - (row['dr'] or Decimal('0'))
            if net_credit > 0:
                posting.add_debit(row['account__code'], net_credit, f'Close {fy.name}')
            elif net_credit < 0:
                posting.add_credit(row['account__code'], -net_credit, f'Close {fy.name}')
            net_profit += net_credit

        retained = self.ACCOUNTS['RETAINED_EARNINGS']
        if net_profit > 0:
            posting.add_credit(retained, net_profit, f'Net profit {fy.name}')
        elif net_profit < 0:
            posting.add_debit(retained, -net_profit, f'Net loss {fy.name}')

        entry = None
        if posting.lines:
            entry = self.post_entry(posting, journal_code='YE', allow_locked_period=True)

        fy.is_closed = True
        fy.closed_at = timezone.now()
        fy.closed_by = self.user
        fy.save(update_fields=['is_closed', 'closed_at', 'closed_by'])
        fy.periods.update(status=FiscalPeriod.PeriodStatus.CLOSED)
        logger.info('Closed fiscal year %s (net %s)', fy.name, net_profit)
        return entry

    @transaction.atomic
    def reopen_fiscal_year(self, fiscal_year: FiscalYear):
        """Reopen a closed year and reverse its closing entry (dated the year end)."""
        fy = FiscalYear.objects.select_for_update().get(pk=fiscal_year.pk)
        if not fy.is_closed:
            raise AccountingError(f'{fy.name} is already open.')
        fy.is_closed = False
        fy.closed_at = None
        fy.closed_by = None
        fy.save(update_fields=['is_closed', 'closed_at', 'closed_by'])

        closing = JournalEntry.objects.filter(
            source_module=self.YEAR_END_SOURCE, source_id=fy.id,
            status=JournalEntry.EntryStatus.POSTED, is_reversal=False,
        ).first()
        if closing:
            return self.create_reversal(closing, entry_date=fy.end_date, allow_locked_period=True)
        return None

    @transaction.atomic
    def create_reversal(self, entry: JournalEntry, entry_date: date = None,
                        allow_locked_period: bool = False) -> JournalEntry:
        """
        Create a full reversal of a posted entry.
        Swaps all debits to credits and vice versa.
        Links back to the original entry.

        Atomic, and locks the original row so it can't be reversed twice by
        concurrent requests.
        """
        entry = JournalEntry.objects.select_for_update().get(pk=entry.pk)
        if entry.status != JournalEntry.EntryStatus.POSTED:
            raise AccountingError('Only posted entries can be reversed.')

        if entry.is_reversal:
            raise AccountingError('Cannot reverse a reversal entry.')

        posting = PostingData(
            description=f'REVERSAL: {entry.description}',
            entry_date=entry_date or date.today(),
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

        reversal = self.post_entry(posting, journal_code=entry.journal.code,
                                   allow_locked_period=allow_locked_period)
        # Link via queryset.update(): the reversal is already POSTED, and
        # JournalEntry.save() (correctly) refuses to modify posted entries, which
        # made every reversal fail. These are linkage fields set in the same
        # transaction that created the entry, not an edit of posted amounts.
        JournalEntry.objects.filter(pk=reversal.pk).update(is_reversal=True, reversed_entry=entry)
        reversal.is_reversal = True
        reversal.reversed_entry = entry

        # Mark original as reversed
        JournalEntry.objects.filter(pk=entry.pk).update(status=JournalEntry.EntryStatus.REVERSED)

        return reversal

    def generate_trial_balance(self, fiscal_period: FiscalPeriod, property_id=None, cost_center_id=None) -> dict:
        """
        Generate Trial Balance for a fiscal period, optionally filtered by Property.
        Returns structured data with account balances.
        """
        from django.db.models import Sum, Case, When, Q  # type: ignore

        qs = JournalLine.objects.filter(
            entry__fiscal_period=fiscal_period,
            entry__status__in=JournalEntry.LEDGER_STATUSES,
        )
        
        if property_id:
            qs = qs.filter(property_ref_id=property_id)
        if cost_center_id:
            qs = qs.filter(cost_center_id=cost_center_id)

        # Aggregate debits and credits per account for the period
        lines = qs.values(
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
