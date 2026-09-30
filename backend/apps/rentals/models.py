"""
Stohil Properties - Rental Management Module Models
Lease management, tenant tracking, invoicing, and maintenance.
"""
import uuid
from decimal import Decimal
from django.db import models, transaction  # type: ignore
from apps.core.models import AuditedModel, TimeStampedModel  # type: ignore


class Lease(AuditedModel):
    """
    Rental lease agreement between a tenant and a property/unit.
    Drives monthly invoice generation and rental income posting.
    """

    class LeaseStatus(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PENDING_SIGNATURE = 'pending_signature', 'Pending Signature'
        ACTIVE = 'active', 'Active'
        EXPIRED = 'expired', 'Expired'
        TERMINATED = 'terminated', 'Terminated Early'
        RENEWED = 'renewed', 'Renewed'

    class LeaseType(models.TextChoices):
        FIXED_TERM = 'fixed_term', 'Fixed Term'
        MONTH_TO_MONTH = 'month_to_month', 'Month-to-Month'
        COMMERCIAL = 'commercial', 'Commercial Lease'

    # References
    lease_number = models.CharField(max_length=50, unique=True, db_index=True)
    property = models.ForeignKey('properties.Property', on_delete=models.PROTECT, related_name='leases')
    unit = models.ForeignKey('properties.PropertyUnit', null=True, blank=True, on_delete=models.SET_NULL)
    tenant = models.ForeignKey('crm.Contact', null=True, blank=True, on_delete=models.SET_NULL, related_name='leases')
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='leases', null=True)

    # Lease terms
    lease_type = models.CharField(max_length=20, choices=LeaseType.choices, default=LeaseType.FIXED_TERM)
    status = models.CharField(max_length=20, choices=LeaseStatus.choices, default=LeaseStatus.DRAFT)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    notice_period_days = models.PositiveSmallIntegerField(default=30)

    # Financial terms
    monthly_rental = models.DecimalField(max_digits=10, decimal_places=2)
    rental_escalation_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('8.00'), help_text='Annual escalation %')
    last_escalation_date = models.DateField(
        null=True, blank=True,
        help_text='Anniversary at which the escalation was last applied (set by billing)',
    )
    deposit_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    deposit_paid = models.BooleanField(default=False)
    deposit_paid_date = models.DateField(null=True, blank=True)
    vat_applicable = models.BooleanField(default=False, help_text='VAT charged on rental (commercial leases)')

    # Invoice settings
    invoice_day = models.PositiveSmallIntegerField(default=1, help_text='Day of month to generate invoice')
    payment_due_days = models.PositiveSmallIntegerField(default=3)
    next_invoice_date = models.DateField(null=True, blank=True)
    last_invoiced_date = models.DateField(null=True, blank=True)

    # Agent
    managing_agent = models.ForeignKey(
        'hr.Employee', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='managed_leases'
    )

    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'rentals_leases'
        ordering = ['-start_date']
        indexes = [models.Index(fields=['status', 'next_invoice_date'])]

    def __str__(self):
        return f'{self.lease_number} - {self.tenant.full_name if self.tenant else "no tenant"}'

    # Finance sync used to run in try/except that only logged, so the user saw
    # "saved" while nothing reached AR/GL. Each save and its sync are now one
    # atomic unit and a failure is raised to the caller (400 via the API).
    def save(self, *args, **kwargs):
        if not self.lease_number:
            from apps.core.services.number_sequence import NumberSequenceService  # type: ignore
            self.lease_number = NumberSequenceService.get_next_number("Lease Agreement", prefix="LSE-", padding=5)
        with transaction.atomic():
            super().save(*args, **kwargs)
            if self.tenant_id:
                from apps.rentals.services.finance_sync import RentalFinanceSyncService  # type: ignore
                RentalFinanceSyncService.sync_tenant_to_customer(self.tenant)


class RentalInvoice(AuditedModel):
    """Monthly rental invoice generated from a lease."""

    class InvoiceStatus(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        SENT = 'sent', 'Sent'
        PAID = 'paid', 'Paid'
        OVERDUE = 'overdue', 'Overdue'
        PARTIAL = 'partial', 'Partially Paid'
        CANCELLED = 'cancelled', 'Cancelled'

    invoice_number = models.CharField(max_length=50, unique=True)
    lease = models.ForeignKey(Lease, on_delete=models.PROTECT, related_name='invoices')
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='rental_invoices', null=True)
    period_start = models.DateField()
    period_end = models.DateField()
    due_date = models.DateField()
    status = models.CharField(max_length=20, choices=InvoiceStatus.choices, default=InvoiceStatus.DRAFT)

    # Amounts
    rental_amount = models.DecimalField(max_digits=10, decimal_places=2)
    vat_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    late_payment_fee = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('0.00'))
    # Recurring lease charges billed with the rent (service charge, utilities,
    # parking...): [{"description", "account_code", "amount", "vat"}], VAT
    # included in total_amount.
    charges = models.JSONField(default=list, blank=True)
    other_charges = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'),
                                        help_text='Total of `charges`, including their VAT')
    # Credit notes issued against this invoice (termination, disputes).
    credited_amount = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    amount_paid = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    balance_due = models.DecimalField(max_digits=10, decimal_places=2)

    # Finance linkage
    journal_entry = models.ForeignKey('finance.JournalEntry', null=True, blank=True, on_delete=models.SET_NULL)
    is_posted_to_finance = models.BooleanField(default=False)

    class Meta:
        db_table = 'rentals_invoices'
        ordering = ['-period_start']

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            from apps.core.services.number_sequence import NumberSequenceService  # type: ignore
            self.invoice_number = NumberSequenceService.get_next_number("Rental Invoice", prefix="RINV-", padding=5)
        with transaction.atomic():
            super().save(*args, **kwargs)
            # Post to AR/GL once the invoice leaves draft.
            if self.status not in (self.InvoiceStatus.DRAFT, self.InvoiceStatus.CANCELLED) \
                    and not self.is_posted_to_finance:
                from apps.rentals.services.finance_sync import RentalFinanceSyncService  # type: ignore
                RentalFinanceSyncService.sync_rental_invoice_to_ar(self)


class RentalPayment(AuditedModel):
    """Individual payment against a rental invoice."""

    class PaymentMethod(models.TextChoices):
        EFT = 'eft', 'EFT / Bank Transfer'
        CASH = 'cash', 'Cash'
        CHEQUE = 'cheque', 'Cheque'
        DEBIT_ORDER = 'debit_order', 'Debit Order'
        CREDIT_CARD = 'credit_card', 'Credit Card'
        ONLINE = 'online', 'Online (tenant portal)'

    invoice = models.ForeignKey(RentalInvoice, on_delete=models.PROTECT, related_name='payments')
    payment_date = models.DateField()
    amount = models.DecimalField(max_digits=10, decimal_places=2, help_text="Cash/Bank amount received")
    withholding_tax = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), help_text="Tax deducted by tenant")
    amount_from_balance = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'), help_text="Amount deducted from tenant credit balance")
    payment_method = models.CharField(max_length=20, choices=PaymentMethod.choices)
    reference = models.CharField(max_length=100)
    notes = models.TextField(blank=True)
    journal_entry = models.ForeignKey('finance.JournalEntry', null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = 'rentals_payments'
        ordering = ['-payment_date']

    def save(self, *args, **kwargs):
        with transaction.atomic():
            super().save(*args, **kwargs)
            # Receipt the payment in AR and the GL.
            if not self.journal_entry_id:
                from apps.rentals.services.finance_sync import RentalFinanceSyncService  # type: ignore
                RentalFinanceSyncService.sync_rental_payment_to_ar(self)


class MaintenanceRequest(AuditedModel):
    """Tenant maintenance request and work order management."""

    class Priority(models.TextChoices):
        LOW = 'low', 'Low'
        MEDIUM = 'medium', 'Medium'
        HIGH = 'high', 'High'
        EMERGENCY = 'emergency', 'Emergency'

    class Status(models.TextChoices):
        LOGGED = 'logged', 'Logged'
        ACKNOWLEDGED = 'acknowledged', 'Acknowledged'
        IN_PROGRESS = 'in_progress', 'In Progress'
        PENDING_PARTS = 'pending_parts', 'Pending Parts'
        COMPLETED = 'completed', 'Completed'
        CLOSED = 'closed', 'Closed'
        CANCELLED = 'cancelled', 'Cancelled'

    reference = models.CharField(max_length=50, unique=True)
    property = models.ForeignKey('properties.Property', on_delete=models.CASCADE, related_name='maintenance_requests', null=True, blank=True)
    lease = models.ForeignKey(Lease, on_delete=models.CASCADE, related_name='maintenance_requests', null=True, blank=True)
    reported_by = models.ForeignKey('crm.Contact', on_delete=models.SET_NULL, null=True)
    priority = models.CharField(max_length=15, choices=Priority.choices, default=Priority.MEDIUM)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.LOGGED)
    category = models.CharField(max_length=100)
    description = models.TextField()
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='maintenance_requests', null=True, blank=True)
    estimated_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    actual_cost = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    assigned_contractor = models.CharField(max_length=200, blank=True)
    # The contractor as an AP supplier: completing the job raises their bill.
    contractor = models.ForeignKey('finance.Supplier', null=True, blank=True, on_delete=models.PROTECT,
                                   related_name='maintenance_jobs')
    scheduled_date = models.DateTimeField(null=True, blank=True)
    completed_date = models.DateTimeField(null=True, blank=True)
    resolution_notes = models.TextField(blank=True)
    billed_to_tenant = models.BooleanField(default=False)
    supplier_invoice = models.ForeignKey('finance.SupplierInvoice', null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='maintenance_jobs')
    recharge_invoice = models.ForeignKey('finance.CustomerInvoice', null=True, blank=True, on_delete=models.SET_NULL,
                                         related_name='maintenance_recharges')

    class Meta:
        db_table = 'rentals_maintenance'
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        if not self.reference:
            from apps.core.services.number_sequence import NumberSequenceService  # type: ignore
            self.reference = NumberSequenceService.get_next_number("Maintenance Request", prefix="MNT-", padding=4)
        super().save(*args, **kwargs)


class LeaseCharge(AuditedModel):
    """A recurring charge billed with the rent (service charge, utilities, parking...)."""

    class ChargeType(models.TextChoices):
        SERVICE_CHARGE = 'service_charge', 'Service Charge / Levy'
        UTILITIES = 'utilities', 'Utilities Recovery'
        PARKING = 'parking', 'Parking'
        INSURANCE = 'insurance', 'Insurance Recovery'
        OTHER = 'other', 'Other'

    lease = models.ForeignKey(Lease, on_delete=models.CASCADE, related_name='charges')
    charge_type = models.CharField(max_length=20, choices=ChargeType.choices, default=ChargeType.SERVICE_CHARGE)
    description = models.CharField(max_length=200)
    monthly_amount = models.DecimalField(max_digits=10, decimal_places=2)
    # Income account; defaults to 4920 Recoveries & Recharges when blank.
    account = models.ForeignKey('finance.ChartOfAccount', null=True, blank=True, on_delete=models.PROTECT)
    vat_applicable = models.BooleanField(default=False)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'rentals_lease_charges'
        ordering = ['lease', 'charge_type']

    def applies_to(self, period_start):
        return self.is_active and (self.start_date is None or self.start_date <= period_start) \
            and (self.end_date is None or self.end_date >= period_start)
