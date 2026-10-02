"""
Property management operations built on the rentals and properties modules:

- utilities: tariffs, meters (unit and bulk), readings recharged on rent invoices
- recoveries: operating costs apportioned by area / percentage / equally,
  billed monthly on account and reconciled to actual cost at year end
- lease terms: stepped and CPI escalations, options and break clauses,
  guarantees and sureties, turnover (percentage) rent
- arrears: configurable stages (reminder, letter, final demand, legal),
  cases per lease with an action log, promises to pay, legal handover
- collections: debit-order mandates and batches, deposit interest
- owners: bulk payment runs with a bank file
- lettings: tenant applications with credit checks
- maintenance: contractor quotes with approval, planned (preventive) jobs
- reports: saved settings and scheduled e-mailing
"""

import builtins
from decimal import Decimal

from django.db import models

from apps.core.models import AuditedModel, TimeStampedModel

ZERO = Decimal('0.00')


# ─── Utilities ───────────────────────────────────────────────────────────────

class Utility(models.TextChoices):
    ELECTRICITY = 'electricity', 'Electricity'
    WATER = 'water', 'Water'
    GAS = 'gas', 'Gas'
    SEWER = 'sewer', 'Sewerage'


class UtilityTariff(TimeStampedModel):
    """Price per unit consumed, optionally stepped: [{"up_to": 50, "rate": "1.20"}, {"up_to": null, "rate": "1.80"}]."""
    name = models.CharField(max_length=100)
    utility = models.CharField(max_length=20, choices=Utility.choices)
    unit_label = models.CharField(max_length=20, default='kWh', help_text='kWh, kl, m³ ...')
    rate = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal('0'),
                               help_text='Flat price per unit (used when there are no steps)')
    steps = models.JSONField(default=list, blank=True)
    fixed_monthly = models.DecimalField(max_digits=10, decimal_places=2, default=ZERO,
                                        help_text='Basic/availability charge per billed month')
    vat_applicable = models.BooleanField(default=False)
    income_account = models.ForeignKey('finance.ChartOfAccount', null=True, blank=True, on_delete=models.PROTECT,
                                       help_text='Defaults to 4920 Recoveries & Recharges')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'propman_tariffs'
        ordering = ['utility', 'name']

    def __str__(self):
        return self.name

    def charge_for(self, consumption: Decimal) -> Decimal:
        consumption = max(Decimal(consumption), Decimal('0'))
        if not self.steps:
            return (consumption * self.rate).quantize(Decimal('0.01'))
        total, lower = Decimal('0'), Decimal('0')
        for step in self.steps:
            upper = Decimal(str(step['up_to'])) if step.get('up_to') not in (None, '') else None
            band = consumption - lower if upper is None else max(min(consumption, upper) - lower, Decimal('0'))
            total += band * Decimal(str(step['rate']))
            if upper is None or consumption <= upper:
                break
            lower = upper
        return total.quantize(Decimal('0.01'))


class Meter(TimeStampedModel):
    """A meter on a unit (tenant meter) or a property-level bulk meter (unit empty)."""
    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE, related_name='meters')
    unit = models.ForeignKey('properties.PropertyUnit', null=True, blank=True, on_delete=models.SET_NULL,
                             related_name='meters')
    utility = models.CharField(max_length=20, choices=Utility.choices)
    serial_number = models.CharField(max_length=60)
    tariff = models.ForeignKey(UtilityTariff, null=True, blank=True, on_delete=models.PROTECT, related_name='meters')
    bulk_meter = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='sub_meters', help_text='Bulk meter this sub-meter falls under')
    multiplier = models.DecimalField(max_digits=8, decimal_places=3, default=Decimal('1'),
                                     help_text='CT ratio / multiplier applied to consumption')
    is_active = models.BooleanField(default=True)
    installed_on = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'propman_meters'
        unique_together = ['utility', 'serial_number']
        ordering = ['property', 'utility', 'serial_number']

    def __str__(self):
        return f'{self.get_utility_display()} {self.serial_number}'


class MeterReading(TimeStampedModel):
    meter = models.ForeignKey(Meter, on_delete=models.CASCADE, related_name='readings')
    reading_date = models.DateField()
    reading = models.DecimalField(max_digits=14, decimal_places=3)
    is_estimate = models.BooleanField(default=False)
    # Consumption since the previous reading x multiplier, set on save.
    consumption = models.DecimalField(max_digits=14, decimal_places=3, default=Decimal('0'))
    billed_invoice = models.ForeignKey('rentals.RentalInvoice', null=True, blank=True, on_delete=models.SET_NULL,
                                       related_name='meter_readings')
    notes = models.CharField(max_length=255, blank=True)
    captured_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = 'propman_meter_readings'
        unique_together = ['meter', 'reading_date']
        ordering = ['meter', '-reading_date']


# ─── Operating-cost recoveries ───────────────────────────────────────────────

class RecoverySchedule(TimeStampedModel):
    """
    Property costs recovered from tenants: billed monthly on account (budget /
    12 x tenant share) and reconciled to the actual cost at year end.
    """

    class Basis(models.TextChoices):
        AREA = 'area', 'By floor area (GLA)'
        PERCENT = 'percent', 'Fixed percentage per lease'
        EQUAL = 'equal', 'Equally per lease'

    class Category(models.TextChoices):
        OPERATING = 'operating', 'Operating costs'
        RATES = 'rates', 'Municipal rates and taxes'
        INSURANCE = 'insurance', 'Insurance'
        SECURITY = 'security', 'Security'
        CLEANING = 'cleaning', 'Cleaning'
        OTHER = 'other', 'Other'

    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE, related_name='recovery_schedules')
    name = models.CharField(max_length=120)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.OPERATING)
    basis = models.CharField(max_length=10, choices=Basis.choices, default=Basis.AREA)
    annual_budget = models.DecimalField(max_digits=14, decimal_places=2, default=ZERO,
                                        help_text='Expected cost for the year (ignored when using property rates)')
    use_property_rates = models.BooleanField(default=False,
                                             help_text="Budget = the property's monthly rates x 12")
    expense_accounts = models.ManyToManyField('finance.ChartOfAccount', blank=True, related_name='+',
                                              help_text='Actual cost = these accounts, tagged with the property')
    recoverable_percent = models.DecimalField(max_digits=6, decimal_places=2, default=Decimal('100.00'),
                                              help_text='Share of the cost that is recoverable at all')
    income_account = models.ForeignKey('finance.ChartOfAccount', null=True, blank=True, on_delete=models.PROTECT,
                                       related_name='+', help_text='Defaults to 4920 Recoveries & Recharges')
    vat_applicable = models.BooleanField(default=False)
    year_start = models.DateField(help_text='First day of the recovery year')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'propman_recovery_schedules'
        ordering = ['property', 'name']

    def __str__(self):
        return f'{self.name} ({self.property})'

    @builtins.property      # `property` is a field name in this class
    def effective_budget(self):
        if self.use_property_rates:
            return (self.property.rates_monthly or ZERO) * 12
        return self.annual_budget


class RecoveryShare(TimeStampedModel):
    """A lease's participation in a schedule; percent is used for the 'percent' basis only."""
    schedule = models.ForeignKey(RecoverySchedule, on_delete=models.CASCADE, related_name='shares')
    lease = models.ForeignKey('rentals.Lease', on_delete=models.CASCADE, related_name='recovery_shares')
    percent = models.DecimalField(max_digits=7, decimal_places=4, null=True, blank=True)

    class Meta:
        db_table = 'propman_recovery_shares'
        unique_together = ['schedule', 'lease']


class RecoveryReconciliation(AuditedModel):
    """Year-end true-up: actual recoverable cost vs. what was billed on account."""
    schedule = models.ForeignKey(RecoverySchedule, on_delete=models.CASCADE, related_name='reconciliations')
    period_start = models.DateField()
    period_end = models.DateField()
    actual_cost = models.DecimalField(max_digits=14, decimal_places=2)
    recoverable_cost = models.DecimalField(max_digits=14, decimal_places=2)
    billed_on_account = models.DecimalField(max_digits=14, decimal_places=2)
    # [{"lease", "lease_number", "share", "due", "billed", "difference", "document"}]
    lines = models.JSONField(default=list)
    posted = models.BooleanField(default=False)

    class Meta:
        db_table = 'propman_recovery_reconciliations'
        ordering = ['-period_end']


# ─── Lease terms ─────────────────────────────────────────────────────────────

class EscalationStep(TimeStampedModel):
    """A scheduled rent change: either a new rent or a % increase from a date."""
    lease = models.ForeignKey('rentals.Lease', on_delete=models.CASCADE, related_name='escalation_steps')
    effective_date = models.DateField()
    new_rent = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    percent = models.DecimalField(max_digits=6, decimal_places=2, null=True, blank=True)
    applied_on = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'propman_escalation_steps'
        unique_together = ['lease', 'effective_date']
        ordering = ['lease', 'effective_date']


class CPIIndex(models.Model):
    """Consumer price index by month (entered manually or by a feed)."""
    month = models.DateField(unique=True, help_text='First day of the month')
    value = models.DecimalField(max_digits=12, decimal_places=4)
    source = models.CharField(max_length=60, blank=True, default='manual')

    class Meta:
        db_table = 'propman_cpi'
        ordering = ['-month']


class LeaseOption(TimeStampedModel):
    class OptionType(models.TextChoices):
        RENEWAL = 'renewal', 'Option to renew'
        BREAK = 'break', 'Break clause'
        PURCHASE = 'purchase', 'Option to purchase'
        EXPANSION = 'expansion', 'Option to expand'

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        EXERCISED = 'exercised', 'Exercised'
        DECLINED = 'declined', 'Declined'
        LAPSED = 'lapsed', 'Lapsed'

    lease = models.ForeignKey('rentals.Lease', on_delete=models.CASCADE, related_name='options')
    option_type = models.CharField(max_length=20, choices=OptionType.choices)
    notice_deadline = models.DateField(help_text='Last day notice can be given')
    effective_date = models.DateField(null=True, blank=True, help_text='When the option takes effect')
    term_months = models.PositiveSmallIntegerField(null=True, blank=True)
    terms = models.TextField(blank=True)
    alert_days = models.PositiveSmallIntegerField(default=90, help_text='Alert this many days before the deadline')
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    alerted_on = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'propman_lease_options'
        ordering = ['notice_deadline']


class LeaseGuarantee(TimeStampedModel):
    class GuaranteeType(models.TextChoices):
        BANK_GUARANTEE = 'bank_guarantee', 'Bank guarantee'
        SURETY = 'surety', 'Personal surety'
        INSURANCE = 'insurance', 'Deposit insurance / guarantee policy'
        OTHER = 'other', 'Other'

    class Status(models.TextChoices):
        HELD = 'held', 'Held'
        RETURNED = 'returned', 'Returned'
        CALLED = 'called', 'Called up'
        EXPIRED = 'expired', 'Expired'

    lease = models.ForeignKey('rentals.Lease', on_delete=models.CASCADE, related_name='guarantees')
    guarantee_type = models.CharField(max_length=20, choices=GuaranteeType.choices)
    provider = models.CharField(max_length=150, help_text='Bank, insurer or surety name')
    reference = models.CharField(max_length=100, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    issued_on = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.HELD)
    document = models.ForeignKey('documents.Document', null=True, blank=True, on_delete=models.SET_NULL)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'propman_lease_guarantees'
        ordering = ['expiry_date']


class TurnoverReport(TimeStampedModel):
    """Tenant turnover for a month; percentage rent above the base rent is billed on the next invoice."""
    lease = models.ForeignKey('rentals.Lease', on_delete=models.CASCADE, related_name='turnover_reports')
    month = models.DateField(help_text='First day of the month the turnover is for')
    turnover = models.DecimalField(max_digits=14, decimal_places=2)
    percentage_rent = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO,
                                          help_text='Due above base rent, set when billed')
    billed_invoice = models.ForeignKey('rentals.RentalInvoice', null=True, blank=True, on_delete=models.SET_NULL,
                                       related_name='turnover_reports')
    submitted_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = 'propman_turnover_reports'
        unique_together = ['lease', 'month']
        ordering = ['lease', '-month']


# ─── Arrears ─────────────────────────────────────────────────────────────────

class ArrearsStage(TimeStampedModel):
    """A step in the collections process, reached when the oldest debt is this many days overdue."""

    class Action(models.TextChoices):
        REMINDER = 'reminder', 'Friendly reminder'
        LETTER = 'letter', 'Letter of demand'
        FINAL = 'final', 'Final demand'
        LEGAL = 'legal', 'Hand over for legal action'

    sequence = models.PositiveSmallIntegerField(unique=True)
    name = models.CharField(max_length=100)
    days_overdue = models.PositiveSmallIntegerField()
    action = models.CharField(max_length=10, choices=Action.choices)
    send_email = models.BooleanField(default=True)
    send_sms = models.BooleanField(default=False)
    subject = models.CharField(max_length=200)
    # Placeholders: {tenant} {lease} {property} {amount} {currency} {days} {company}
    template = models.TextField()
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'propman_arrears_stages'
        ordering = ['sequence']

    def __str__(self):
        return self.name


class ArrearsCase(AuditedModel):
    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        PROMISE = 'promise', 'Promise to pay'
        LEGAL = 'legal', 'With attorneys'
        SETTLED = 'settled', 'Settled'
        WRITTEN_OFF = 'written_off', 'Written off'

    lease = models.ForeignKey('rentals.Lease', on_delete=models.PROTECT, related_name='arrears_cases')
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.OPEN)
    stage = models.ForeignKey(ArrearsStage, null=True, blank=True, on_delete=models.SET_NULL)
    amount_overdue = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    oldest_due_date = models.DateField(null=True, blank=True)
    opened_on = models.DateField()
    closed_on = models.DateField(null=True, blank=True)
    promise_date = models.DateField(null=True, blank=True)
    promise_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    attorney = models.CharField(max_length=150, blank=True)
    legal_reference = models.CharField(max_length=100, blank=True)
    handed_over_on = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'propman_arrears_cases'
        ordering = ['-opened_on']


class ArrearsAction(TimeStampedModel):
    case = models.ForeignKey(ArrearsCase, on_delete=models.CASCADE, related_name='actions')
    stage = models.ForeignKey(ArrearsStage, null=True, blank=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=30, help_text='reminder, letter, final, legal, promise, note, payment')
    description = models.TextField(blank=True)
    amount_overdue = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    messages = models.ManyToManyField('notifications.Message', blank=True)
    created_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = 'propman_arrears_actions'
        ordering = ['-created_at']


# ─── Collections ─────────────────────────────────────────────────────────────

class DebitOrderMandate(TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        SUSPENDED = 'suspended', 'Suspended'
        CANCELLED = 'cancelled', 'Cancelled'

    class AccountType(models.TextChoices):
        CURRENT = 'current', 'Current / cheque'
        SAVINGS = 'savings', 'Savings'

    lease = models.ForeignKey('rentals.Lease', on_delete=models.CASCADE, related_name='debit_mandates')
    reference = models.CharField(max_length=40, unique=True)
    account_holder = models.CharField(max_length=150)
    bank_name = models.CharField(max_length=100)
    branch_code = models.CharField(max_length=20)
    account_number = models.CharField(max_length=40)
    account_type = models.CharField(max_length=10, choices=AccountType.choices, default=AccountType.CURRENT)
    collect_full_balance = models.BooleanField(default=True, help_text='Collect the open balance; else fixed_amount')
    fixed_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    collection_day = models.PositiveSmallIntegerField(default=1)
    signed_on = models.DateField()
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    class Meta:
        db_table = 'propman_debit_mandates'


class DebitOrderBatch(AuditedModel):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        SUBMITTED = 'submitted', 'Submitted to bank'
        PROCESSED = 'processed', 'Results processed'

    number = models.CharField(max_length=30, unique=True)
    collection_date = models.DateField()
    bank_account = models.ForeignKey('finance.BankAccount', on_delete=models.PROTECT)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=ZERO)

    class Meta:
        db_table = 'propman_debit_batches'
        ordering = ['-collection_date']


class DebitOrderItem(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PAID = 'paid', 'Paid'
        UNPAID = 'unpaid', 'Unpaid (returned)'

    batch = models.ForeignKey(DebitOrderBatch, on_delete=models.CASCADE, related_name='items')
    mandate = models.ForeignKey(DebitOrderMandate, on_delete=models.PROTECT, related_name='items')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    unpaid_reason = models.CharField(max_length=100, blank=True)
    payments = models.ManyToManyField('rentals.RentalPayment', blank=True)

    class Meta:
        db_table = 'propman_debit_items'


class DepositInterest(TimeStampedModel):
    """Interest credited to a tenant's deposit for a month."""
    lease = models.ForeignKey('rentals.Lease', on_delete=models.CASCADE, related_name='deposit_interest')
    month = models.DateField()
    rate = models.DecimalField(max_digits=6, decimal_places=3, help_text='Annual %')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    journal_entry = models.ForeignKey('finance.JournalEntry', null=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = 'propman_deposit_interest'
        unique_together = ['lease', 'month']


# ─── Owners ──────────────────────────────────────────────────────────────────

class OwnerPaymentRun(AuditedModel):
    number = models.CharField(max_length=30, unique=True)
    run_date = models.DateField()
    bank_account = models.ForeignKey('finance.BankAccount', on_delete=models.PROTECT)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=ZERO)
    # [{"owner", "name", "amount", "journal_entry", "bank_name", "branch_code", "account_number", "account_name"}]
    lines = models.JSONField(default=list)

    class Meta:
        db_table = 'propman_owner_payment_runs'
        ordering = ['-run_date']


# ─── Lettings ────────────────────────────────────────────────────────────────

class TenantApplication(AuditedModel):
    class Status(models.TextChoices):
        NEW = 'new', 'New'
        SCREENING = 'screening', 'Screening'
        APPROVED = 'approved', 'Approved'
        DECLINED = 'declined', 'Declined'
        WITHDRAWN = 'withdrawn', 'Withdrawn'
        CONVERTED = 'converted', 'Lease created'

    class CreditStatus(models.TextChoices):
        NOT_RUN = 'not_run', 'Not run'
        PENDING = 'pending', 'Pending'
        CLEAR = 'clear', 'Clear'
        ADVERSE = 'adverse', 'Adverse'
        ERROR = 'error', 'Error'

    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE, related_name='applications')
    unit = models.ForeignKey('properties.PropertyUnit', null=True, blank=True, on_delete=models.SET_NULL,
                             related_name='applications')
    applicant = models.ForeignKey('crm.Contact', on_delete=models.PROTECT, related_name='rental_applications')
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.NEW)
    desired_start = models.DateField(null=True, blank=True)
    offered_rent = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    monthly_income = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    employer = models.CharField(max_length=150, blank=True)
    references = models.TextField(blank=True)
    credit_status = models.CharField(max_length=10, choices=CreditStatus.choices, default=CreditStatus.NOT_RUN)
    credit_score = models.PositiveIntegerField(null=True, blank=True)
    credit_provider = models.CharField(max_length=50, blank=True)
    credit_reference = models.CharField(max_length=100, blank=True)
    credit_checked_at = models.DateTimeField(null=True, blank=True)
    credit_notes = models.TextField(blank=True)
    lease = models.ForeignKey('rentals.Lease', null=True, blank=True, on_delete=models.SET_NULL,
                              related_name='applications')
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'propman_tenant_applications'
        ordering = ['-created_at']

    @builtins.property      # `property` is a field name in this class
    def rent_to_income(self):
        rent = self.offered_rent or (self.unit.monthly_rental if self.unit_id else None)
        if rent and self.monthly_income:
            return (Decimal(rent) / self.monthly_income * 100).quantize(Decimal('0.1'))
        return None


# ─── Maintenance ─────────────────────────────────────────────────────────────

class MaintenanceQuote(AuditedModel):
    class Status(models.TextChoices):
        SUBMITTED = 'submitted', 'Submitted'
        AWAITING_OWNER = 'awaiting_owner', 'Awaiting owner approval'
        ACCEPTED = 'accepted', 'Accepted'
        REJECTED = 'rejected', 'Rejected'

    request = models.ForeignKey('rentals.MaintenanceRequest', on_delete=models.CASCADE, related_name='quotes')
    supplier = models.ForeignKey('finance.Supplier', on_delete=models.PROTECT, related_name='maintenance_quotes')
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    description = models.TextField(blank=True)
    valid_until = models.DateField(null=True, blank=True)
    document = models.FileField(upload_to='maintenance/quotes/%Y/%m/', null=True, blank=True)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.SUBMITTED)
    decided_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    decided_at = models.DateTimeField(null=True, blank=True)
    owner_decision_note = models.TextField(blank=True)
    purchase_order = models.ForeignKey('procurement.PurchaseOrder', null=True, blank=True, on_delete=models.SET_NULL,
                                       related_name='maintenance_quotes')

    class Meta:
        db_table = 'propman_maintenance_quotes'
        ordering = ['amount']


class MaintenancePlan(TimeStampedModel):
    """Planned / preventive maintenance: a job raised automatically every N months."""
    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE, related_name='maintenance_plans')
    unit = models.ForeignKey('properties.PropertyUnit', null=True, blank=True, on_delete=models.SET_NULL)
    title = models.CharField(max_length=150, help_text='e.g. Lift service, Generator service')
    category = models.CharField(max_length=100, default='General')
    description = models.TextField(blank=True)
    frequency_months = models.PositiveSmallIntegerField(default=12)
    next_due = models.DateField()
    lead_days = models.PositiveSmallIntegerField(default=14, help_text='Raise the job this many days before')
    contractor = models.ForeignKey('finance.Supplier', null=True, blank=True, on_delete=models.SET_NULL)
    estimated_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    priority = models.CharField(max_length=15, default='medium')
    is_active = models.BooleanField(default=True)
    last_raised = models.ForeignKey('rentals.MaintenanceRequest', null=True, blank=True, on_delete=models.SET_NULL,
                                    related_name='+')

    class Meta:
        db_table = 'propman_maintenance_plans'
        ordering = ['next_due']


# ─── Reports ─────────────────────────────────────────────────────────────────

class SavedReport(TimeStampedModel):
    class Schedule(models.TextChoices):
        NONE = 'none', 'Not scheduled'
        WEEKLY = 'weekly', 'Weekly (Mondays)'
        MONTHLY = 'monthly', 'Monthly (1st)'

    name = models.CharField(max_length=120)
    report = models.CharField(max_length=40, help_text='Report key, e.g. rent_roll')
    params = models.JSONField(default=dict, blank=True)
    owner = models.ForeignKey('core.User', on_delete=models.CASCADE, related_name='saved_reports')
    schedule = models.CharField(max_length=10, choices=Schedule.choices, default=Schedule.NONE)
    recipients = models.TextField(blank=True, help_text='Comma-separated emails for scheduled sends')
    last_sent_on = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'propman_saved_reports'
        ordering = ['name']
