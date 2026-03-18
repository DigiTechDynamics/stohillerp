from django.db import models
from apps.core.models import AuditedModel, TimeStampedModel
from decimal import Decimal

class PayrollRun(AuditedModel):
    """Represents a payroll processing period."""
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PROCESSING = 'processing', 'Processing'
        APPROVED = 'approved', 'Approved'
        PAID = 'paid', 'Paid'
        CANCELLED = 'cancelled', 'Cancelled'

    name = models.CharField(max_length=100, help_text="e.g. March 2024 Monthly Payroll")
    period_start = models.DateField()
    period_end = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    total_gross = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    total_deductions = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    total_net = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    processed_at = models.DateTimeField(null=True, blank=True)
    processed_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='processed_payroll_runs')
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='payroll_runs', null=True)
    supplier_invoice = models.ForeignKey('finance.SupplierInvoice', on_delete=models.SET_NULL, null=True, blank=True, related_name='payroll_runs')

    class Meta(AuditedModel.Meta):
        db_table = 'payroll_runs'
        ordering = ['-period_end']

    def __str__(self):
        return f"{self.name} ({self.status})"

class PayrollItem(TimeStampedModel):
    """Individual pay record for an employee or agent within a payroll run."""
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PAID = 'paid', 'Paid'
        VOID = 'void', 'Void'

    payroll_run = models.ForeignKey(PayrollRun, on_delete=models.CASCADE, related_name='items')
    employee = models.ForeignKey('hr.Employee', on_delete=models.PROTECT, related_name='payroll_items')
    
    # Components
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    bonus = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    
    # Deductions
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'), help_text="PAYE")
    aids_levy = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'), help_text="3% of PAYE")
    nssa_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'), help_text="NSSA Pension")
    other_deductions = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    
    # Calculated
    gross_amount = models.DecimalField(max_digits=15, decimal_places=2)
    net_amount = models.DecimalField(max_digits=15, decimal_places=2)
    
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    payment_reference = models.CharField(max_length=100, blank=True)
    bank_account_snapshot = models.CharField(max_length=255, blank=True, help_text="Stored at time of payroll for audit")

    class Meta(TimeStampedModel.Meta):
        db_table = 'payroll_items'
        unique_together = ['payroll_run', 'employee']

    def __str__(self):
        return f"{self.employee.full_name} - {self.payroll_run.name}"

    def save(self, *args, **kwargs):
        self.gross_amount = self.basic_salary + self.commission_amount + self.bonus
        total_deduc = self.tax_amount + self.aids_levy + self.nssa_deduction + self.other_deductions
        self.net_amount = self.gross_amount - total_deduc
        super().save(*args, **kwargs)

class TaxBracket(AuditedModel):
    """Configurable tax brackets for PAYE."""
    currency = models.ForeignKey('core.Currency', on_delete=models.CASCADE, related_name='tax_brackets')
    min_amount = models.DecimalField(max_digits=12, decimal_places=2)
    max_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, help_text="Percentage e.g. 25.00")
    fixed_deduction = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'), help_text="Amount to subtract after applying rate")
    
    class Meta(AuditedModel.Meta):
        db_table = 'payroll_tax_brackets'
        ordering = ['currency', 'min_amount']

    def __str__(self):
        return f"{self.currency.code}: {self.min_amount} - {self.max_amount or 'Above'} ({self.tax_rate}%)"

class PayrollSetting(AuditedModel):
    """Global payroll settings like AIDS Levy and NSSA rates."""
    name = models.CharField(max_length=100, unique=True)
    key = models.SlugField(max_length=100, unique=True)
    value = models.DecimalField(max_digits=10, decimal_places=5)
    description = models.TextField(blank=True)
    
    class Meta(AuditedModel.Meta):
        db_table = 'payroll_settings'

    def __str__(self):
        return self.name
