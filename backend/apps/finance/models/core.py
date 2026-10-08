"""
Stohil Properties - Finance Module Models
Enterprise-grade double-entry accounting system.

Architecture follows Generally Accepted Accounting Principles (GAAP):
- Every transaction has equal debits and credits
- Journals contain JournalLines (debit/credit pairs)
- Posted entries are IMMUTABLE
- Fiscal periods can be locked to prevent backdating
- Automatic posting from Sales, Rentals, and Commission modules

Account Types and Normal Balances:
  Assets:      Debit increases, Credit decreases
  Liabilities: Credit increases, Debit decreases
  Equity:      Credit increases, Debit decreases
  Revenue:     Credit increases, Debit decreases
  Expenses:    Debit increases, Credit decreases
"""

import uuid
from decimal import Decimal
from django.db import models
from django.utils import timezone
from django.core.exceptions import ValidationError
from apps.core.models import AuditedModel, TimeStampedModel


# ─── Chart of Accounts ────────────────────────────────────────────────────────

class ChartOfAccount(AuditedModel):
    """
    Chart of Accounts (CoA) - The master list of all GL accounts.
    Hierarchical structure supporting parent/child account grouping.
    Standard South African real estate CoA structure.
    """

    class AccountType(models.TextChoices):
        ASSET = 'asset', 'Asset'
        LIABILITY = 'liability', 'Liability'
        EQUITY = 'equity', 'Equity'
        REVENUE = 'revenue', 'Revenue'
        EXPENSE = 'expense', 'Expense'
        CONTRA = 'contra', 'Contra Account'

    class AccountSubType(models.TextChoices):
        # Assets
        CURRENT_ASSET = 'current_asset', 'Current Asset'
        FIXED_ASSET = 'fixed_asset', 'Fixed Asset'
        INVESTMENT = 'investment', 'Investment'
        BANK = 'bank', 'Bank / Cash'
        RECEIVABLE = 'receivable', 'Accounts Receivable'

        # Liabilities
        CURRENT_LIABILITY = 'current_liability', 'Current Liability'
        LONG_TERM_LIABILITY = 'long_term_liability', 'Long-Term Liability'
        PAYABLE = 'payable', 'Accounts Payable'
        TAX_LIABILITY = 'tax_liability', 'Tax Liability'

        # Equity
        RETAINED_EARNINGS = 'retained_earnings', 'Retained Earnings'
        SHARE_CAPITAL = 'share_capital', 'Share Capital'

        # Revenue
        OPERATING_REVENUE = 'operating_revenue', 'Operating Revenue'
        OTHER_INCOME = 'other_income', 'Other Income'

        # Expenses
        OPERATING_EXPENSE = 'operating_expense', 'Operating Expense'
        COST_OF_SALES = 'cost_of_sales', 'Cost of Sales'
        ADMIN_EXPENSE = 'admin_expense', 'Administrative Expense'
        DEPRECIATION = 'depreciation', 'Depreciation'

    code = models.CharField(max_length=20, unique=True, db_index=True)
    name = models.CharField(max_length=200)
    account_type = models.CharField(max_length=20, choices=AccountType.choices)
    account_sub_type = models.CharField(max_length=30, choices=AccountSubType.choices)
    parent = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='children'
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    is_system = models.BooleanField(default=False, help_text='System accounts cannot be deleted')
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='accounts', null=True)
    allow_direct_posting = models.BooleanField(
        default=True,
        help_text='If False, only child accounts can receive postings'
    )
    allow_manual_entry = models.BooleanField(
        default=True,
        help_text='Whether this account can be used in manual journal entries'
    )
    requires_cost_center = models.BooleanField(
        default=False,
        help_text='Postings to this account must carry a cost center (dimension).'
    )
    allowed_transaction_types = models.JSONField(
        default=list,
        blank=True,
        help_text='List of allowed JournalEntry types (e.g. ["manual", "sales"]). Empty means all are allowed.'
    )

    # Balance tracking (denormalized for performance, reconciled periodically)
    current_balance = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))

    class Meta:
        db_table = 'finance_chart_of_accounts'
        ordering = ['code']
        indexes = [models.Index(fields=['account_type', 'is_active'])]

    def __str__(self):
        return f'{self.code} - {self.name}'

    def save(self, *args, **kwargs):
        if not self.currency_id:
            # New accounts default to the base (reporting) currency.
            from apps.finance.services.fx import base_currency
            self.currency = base_currency()
        super().save(*args, **kwargs)

    @property
    def normal_balance(self):
        """Returns 'debit' or 'credit' - the side that increases this account."""
        if self.account_type in ['asset', 'expense', 'contra']:
            return 'debit'
        return 'credit'


# ─── Fiscal Periods ───────────────────────────────────────────────────────────

class FiscalYear(AuditedModel):
    """
    Fiscal year definition. South Africa tax year: March 1 to Feb 28/29.
    Once closed, no postings can be made to any period within it.
    """
    name = models.CharField(max_length=50)  # e.g., "FY 2024/25"
    start_date = models.DateField()
    end_date = models.DateField()
    is_closed = models.BooleanField(default=False)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = 'finance_fiscal_years'
        ordering = ['-start_date']

    def __str__(self):
        return self.name


class FiscalPeriod(AuditedModel):
    """
    Monthly accounting periods within a fiscal year.
    Locking a period prevents any new journal entries dated within it.
    """

    class PeriodStatus(models.TextChoices):
        OPEN = 'open', 'Open'
        LOCKED = 'locked', 'Locked'
        CLOSED = 'closed', 'Closed'

    fiscal_year = models.ForeignKey(FiscalYear, on_delete=models.PROTECT, related_name='periods')
    name = models.CharField(max_length=50)  # e.g., "March 2024"
    period_number = models.PositiveSmallIntegerField()  # 1-12
    start_date = models.DateField()
    end_date = models.DateField()
    status = models.CharField(max_length=10, choices=PeriodStatus.choices, default=PeriodStatus.OPEN)
    locked_at = models.DateTimeField(null=True, blank=True)
    locked_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = 'finance_fiscal_periods'
        ordering = ['fiscal_year', 'period_number']
        unique_together = ['fiscal_year', 'period_number']

    def __str__(self):
        return f'{self.fiscal_year.name} - {self.name}'

    def is_open_for_posting(self):
        """Returns True if this period accepts new journal entries."""
        return self.status == self.PeriodStatus.OPEN and not self.fiscal_year.is_closed


# ─── Journals ─────────────────────────────────────────────────────────────────




class ExchangeRate(AuditedModel):
    """
    Exchange rates for multi-currency support.
    Rates are stored relative to the system base currency (reporting currency).
    Example: if USD is base, ZAR rate might be 0.052 (1 ZAR = 0.052 USD).
    """
    currency = models.ForeignKey('core.Currency', on_delete=models.CASCADE, related_name='exchange_rates')
    rate = models.DecimalField(max_digits=18, decimal_places=10)
    effective_date = models.DateField(default=timezone.now)

    class Meta:
        db_table = 'finance_exchange_rates'
        ordering = ['-effective_date']
        unique_together = ['currency', 'effective_date']

    def __str__(self):
        return f"{self.currency.code} rate on {self.effective_date}: {self.rate}"


class Journal(AuditedModel):
    """
    Journal types define the source/purpose of entries.
    (General, Sales, Rental, Payroll, Commission, etc.)
    """
    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    auto_posting = models.BooleanField(
        default=False,
        help_text='Entries posted automatically by system modules'
    )

    class Meta:
        db_table = 'finance_journals'

    def __str__(self):
        return f'{self.code} - {self.name}'


class JournalBatch(AuditedModel):
    """
    Groups multiple Journal Entries together for Maker/Checker approval workflows.
    Entries in a batch must share the same fiscal period and journal type.
    """
    class BatchStatus(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PENDING_APPROVAL = 'pending', 'Pending Approval'
        APPROVED = 'approved', 'Approved'
        POSTED = 'posted', 'Posted'
        REJECTED = 'rejected', 'Rejected'

    batch_number = models.CharField(max_length=50, unique=True, db_index=True)
    description = models.CharField(max_length=255)
    fiscal_period = models.ForeignKey(FiscalPeriod, on_delete=models.PROTECT, related_name='batches')
    journal = models.ForeignKey(Journal, on_delete=models.PROTECT, related_name='batches')
    
    status = models.CharField(max_length=20, choices=BatchStatus.choices, default=BatchStatus.DRAFT)
    
    total_debits = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    total_credits = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    
    # Maker/Checker validation
    maker = models.ForeignKey('core.User', on_delete=models.PROTECT, related_name='created_batches')
    checker = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.PROTECT, related_name='approved_batches')
    approved_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.PROTECT, related_name='posted_batches')
    posted_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True)

    class Meta:
        db_table = 'finance_journal_batches'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.batch_number} - {self.description}'

    def is_balanced(self):
        return self.total_debits == self.total_credits

    def save(self, *args, **kwargs):
        if not self.batch_number:
            from apps.core.services.number_sequence import NumberSequenceService
            self.batch_number = NumberSequenceService.get_next_number("Journal Batch", prefix="JB-", padding=6)
        
        # Enforce Maker != Checker
        if self.status in [self.BatchStatus.APPROVED, self.BatchStatus.POSTED]:
            if self.maker_id and self.checker_id and self.maker_id == self.checker_id:
                raise ValidationError("Maker and Checker cannot be the same user. Role segregation required.")
                
        super().save(*args, **kwargs)


class JournalEntry(AuditedModel):
    """
    A Journal Entry (JE) is the header record for a double-entry transaction.
    Contains one or more JournalLines where sum(debits) == sum(credits).

    IMMUTABILITY RULE:
    Once status = 'posted', the entry and all its lines are locked forever.
    Corrections must use reversal entries.
    """

    class EntryStatus(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PENDING_APPROVAL = 'pending', 'Pending Approval'
        APPROVED = 'approved', 'Approved'
        POSTED = 'posted', 'Posted'  # IMMUTABLE after this
        REVERSED = 'reversed', 'Reversed'
        CANCELLED = 'cancelled', 'Cancelled'

    class EntryType(models.TextChoices):
        MANUAL = 'manual', 'Manual Entry'
        SALES = 'sales', 'Sales Transaction'
        RENTAL = 'rental', 'Rental Transaction'
        COMMISSION = 'commission', 'Commission'
        PAYROLL = 'payroll', 'Payroll'
        DEPRECIATION = 'depreciation', 'Depreciation'
        ADJUSTMENT = 'adjustment', 'Adjustment'
        REVERSAL = 'reversal', 'Reversal Entry'
        OPENING_BALANCE = 'opening_balance', 'Opening Balance'

    # Statuses whose lines are in the ledger. A reversed entry stays in the
    # books next to its (posted) reversal so the two net to zero; reporting on
    # POSTED alone dropped the original and left only the reversal.
    LEDGER_STATUSES = (EntryStatus.POSTED, EntryStatus.REVERSED)

    # Reference
    reference = models.CharField(max_length=50, unique=True, db_index=True)
    batch = models.ForeignKey(JournalBatch, null=True, blank=True, on_delete=models.PROTECT, related_name='entries')
    journal = models.ForeignKey(Journal, on_delete=models.PROTECT, related_name='entries')
    fiscal_period = models.ForeignKey(FiscalPeriod, on_delete=models.PROTECT, related_name='entries')
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='entries', null=True)
    exchange_rate = models.DecimalField(max_digits=18, decimal_places=10, default=Decimal('1.0000000000'))

    # Entry details
    entry_type = models.CharField(max_length=20, choices=EntryType.choices, default=EntryType.MANUAL)
    status = models.CharField(max_length=20, choices=EntryStatus.choices, default=EntryStatus.DRAFT)
    entry_date = models.DateField(db_index=True)
    description = models.CharField(max_length=500)
    narration = models.TextField(blank=True)

    # Source references (for auto-posted entries from other modules)
    source_module = models.CharField(max_length=50, blank=True)  # e.g., 'sales', 'rental'
    source_id = models.UUIDField(null=True, blank=True)  # FK to source record
    source_reference = models.CharField(max_length=100, blank=True)  # Human-readable ref

    # Posting metadata
    posted_at = models.DateTimeField(null=True, blank=True)
    posted_by = models.ForeignKey(
        'core.User', null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='posted_entries'
    )

    # Accruals and unrealised FX revaluations reverse themselves on this date
    # (processed by the daily job).
    auto_reverse_date = models.DateField(null=True, blank=True, db_index=True)

    # Reversal tracking
    is_reversal = models.BooleanField(default=False)
    reversed_entry = models.ForeignKey(
        'self', null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='reversal_entries'
    )

    class Meta:
        db_table = 'finance_journal_entries'
        ordering = ['-entry_date', '-created_at']
        indexes = [
            models.Index(fields=['status', 'entry_date']),
            models.Index(fields=['source_module', 'source_id']),
        ]

    def __str__(self):
        return f'{self.reference} - {self.description}'

    def get_total_debits(self):
        return self.lines.filter(side='debit').aggregate(
            total=models.Sum('amount')
        )['total'] or Decimal('0.00')

    def get_total_credits(self):
        return self.lines.filter(side='credit').aggregate(
            total=models.Sum('amount')
        )['total'] or Decimal('0.00')

    def is_balanced(self):
        """Core double-entry validation: debits must equal credits."""
        return self.get_total_debits() == self.get_total_credits()

    def clean(self):
        """Validate entry before saving."""
        if self.status == self.EntryStatus.POSTED:
            raise ValidationError('Cannot modify a posted journal entry. Create a reversal instead.')

    def save(self, *args, **kwargs):
        if self.pk:
            # Prevent modification of posted entries (immutability rule)
            original = JournalEntry.objects.filter(pk=self.pk).first()
            if original and original.status == self.EntryStatus.POSTED:
                raise ValidationError('Posted journal entries are immutable.')
        super().save(*args, **kwargs)


class JournalLine(models.Model):
    """
    Individual debit or credit line within a Journal Entry.
    Every JournalEntry must have at least one debit and one credit line
    with equal totals.
    """

    class LineSide(models.TextChoices):
        DEBIT = 'debit', 'Debit (Dr)'
        CREDIT = 'credit', 'Credit (Cr)'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    entry = models.ForeignKey(JournalEntry, on_delete=models.CASCADE, related_name='lines')
    account = models.ForeignKey(ChartOfAccount, on_delete=models.PROTECT, related_name='journal_lines')
    side = models.CharField(max_length=10, choices=LineSide.choices)
    amount_currency = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    description = models.CharField(max_length=500, blank=True)

    # Optional linkage for sub-ledger tracking
    property_ref = models.ForeignKey('properties.Property', null=True, blank=True, on_delete=models.SET_NULL)
    contact_ref = models.ForeignKey('crm.Contact', null=True, blank=True, on_delete=models.SET_NULL)
    supplier_ref = models.ForeignKey('finance.Supplier', null=True, blank=True, on_delete=models.SET_NULL)
    employee_ref = models.ForeignKey('hr.Employee', null=True, blank=True, on_delete=models.SET_NULL)
    # Analytical dimension (business unit, branch, development project...).
    cost_center = models.ForeignKey('finance.CostCenter', null=True, blank=True, on_delete=models.PROTECT,
                                    related_name='journal_lines')

    # VAT tracking
    vat_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    vat_code = models.CharField(max_length=10, blank=True)

    class Meta:
        db_table = 'finance_journal_lines'
        indexes = [
            models.Index(fields=['account', 'entry']),
            models.Index(fields=['contact_ref']),
            models.Index(fields=['supplier_ref']),
            models.Index(fields=['employee_ref']),
        ]

    def __str__(self):
        return f'{self.entry.reference} | {self.account.code} | {self.side} {self.amount}'

    def clean(self):
        if self.amount <= 0:
            raise ValidationError('Journal line amount must be positive.')


# ─── Financial Reporting Views (computed) ─────────────────────────────────────

class TrialBalance(models.Model):
    """
    Snapshot of Trial Balance for a specific period.
    Generated and stored for audit trail and performance.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fiscal_period = models.ForeignKey(FiscalPeriod, on_delete=models.PROTECT)
    generated_at = models.DateTimeField(auto_now_add=True)
    generated_by = models.ForeignKey('core.User', null=True, on_delete=models.SET_NULL)
    data = models.JSONField(default=dict)  # Serialized TB data for caching
    total_debits = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_credits = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    is_balanced = models.BooleanField(default=False)

    class Meta:
        db_table = 'finance_trial_balances'
        ordering = ['-generated_at']


class BudgetLine(AuditedModel):
    """Budget vs Actual tracking per account per period."""
    fiscal_period = models.ForeignKey(FiscalPeriod, on_delete=models.CASCADE)
    account = models.ForeignKey(ChartOfAccount, on_delete=models.CASCADE)
    budgeted_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'finance_budget_lines'
        unique_together = ['fiscal_period', 'account']


class CostCenter(TimeStampedModel):
    """
    Cost centers for tracking income/expenses by business unit or property.
    """
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    property = models.ForeignKey(
        'properties.Property', null=True, blank=True,
        on_delete=models.SET_NULL
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'finance_cost_centers'

    def __str__(self):
        return f'{self.code} - {self.name}'





class PostingProfile(AuditedModel):
    """
    User-configurable GL account mappings for automated transactions.
    Replaces hardcoded account codes with dynamic database settings.
    """
    name = models.CharField(max_length=100, unique=True)
    is_default = models.BooleanField(
        default=False,
        help_text='If true, this profile will be used for all system postings.'
    )

    # Asset Accounts
    bank_main = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='bank_main_profiles', limit_choices_to={'account_type': 'asset'}
    )
    bank_trust = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='bank_trust_profiles', limit_choices_to={'account_type': 'asset'}
    )
    accounts_receivable = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='ar_profiles', limit_choices_to={'account_type': 'asset'}
    )
    commission_receivable = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='comm_rec_profiles', limit_choices_to={'account_type': 'asset'}
    )

    # Liability Accounts
    accounts_payable = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='ap_profiles', limit_choices_to={'account_type': 'liability'}
    )
    vat_payable = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='vat_pay_profiles', limit_choices_to={'account_type': 'liability'}
    )
    vat_receivable = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='vat_rec_profiles', limit_choices_to={'account_type': 'liability'}
    )
    tenant_deposits = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='deposit_profiles', limit_choices_to={'account_type': 'liability'}
    )
    commission_payable = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='comm_pay_profiles', limit_choices_to={'account_type': 'liability'}
    )

    # Equity Accounts
    retained_earnings = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='retained_profiles', limit_choices_to={'account_type': 'equity'}
    )

    # Revenue Accounts
    rental_income = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='rental_inc_profiles', limit_choices_to={'account_type': 'revenue'}
    )
    commission_income = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='comm_inc_profiles', limit_choices_to={'account_type': 'revenue'}
    )
    sale_revenue = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='sale_rev_profiles', limit_choices_to={'account_type': 'revenue'},
        null=True, blank=True
    )

    # Expense Accounts
    cost_of_sales = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='cos_profiles', limit_choices_to={'account_type': 'expense'},
        null=True, blank=True
    )
    commission_expense = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='comm_exp_profiles', limit_choices_to={'account_type': 'expense'},
        null=True, blank=True
    )

    # Inventory Accounts
    property_inventory = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT,
        related_name='inv_profiles', limit_choices_to={'account_type': 'asset'},
        null=True, blank=True
    )

    # Property management. Blank falls back to the starter chart's code
    # (AccountingService.DEFAULT_ACCOUNTS), so existing profiles keep working.
    owner_funds = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT, related_name='owner_funds_profiles',
        limit_choices_to={'account_type': 'liability'}, null=True, blank=True,
        help_text='Trust liability for money held for property owners (starter chart: 2210).'
    )
    management_fees = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT, related_name='mgmt_fee_profiles',
        limit_choices_to={'account_type': 'revenue'}, null=True, blank=True,
        help_text='Management, letting and agency fee income (starter chart: 4300).'
    )
    recoveries_income = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT, related_name='recoveries_profiles',
        limit_choices_to={'account_type': 'revenue'}, null=True, blank=True,
        help_text='Recharges to tenants: utilities, recoveries, damages (starter chart: 4920).'
    )
    maintenance = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT, related_name='maintenance_profiles',
        limit_choices_to={'account_type': 'expense'}, null=True, blank=True,
        help_text='Maintenance and repairs on company-owned property (starter chart: 5300).'
    )
    withholding_tax = models.ForeignKey(
        ChartOfAccount, on_delete=models.RESTRICT, related_name='wht_profiles',
        limit_choices_to={'account_type': 'asset'}, null=True, blank=True,
        help_text='Tax withheld by tenants and claimable (starter chart: 1120).'
    )

    class Meta:
        db_table = 'finance_posting_profiles'

    def __str__(self):
        return f'{self.name} {"(Default)" if self.is_default else ""}'

    def save(self, *args, **kwargs):
        if self.is_default:
            # Ensure only one profile is default
            PostingProfile.objects.exclude(pk=self.pk).update(is_default=False)
        super().save(*args, **kwargs)
