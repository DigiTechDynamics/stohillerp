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

class SalaryRule(AuditedModel):
    class Category(models.TextChoices):
        BASIC = 'basic', 'Basic'
        ALLOWANCE = 'allowance', 'Allowance'
        DEDUCTION = 'deduction', 'Deduction'
        NET = 'net', 'Net'
        EMPLOYER = 'employer', 'Employer Contribution'

    class AmountType(models.TextChoices):
        FIXED = 'fixed', 'Fixed Amount'
        PERCENTAGE = 'percentage', 'Percentage (%)'

    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, unique=True)
    category = models.CharField(max_length=20, choices=Category.choices)
    sequence = models.PositiveIntegerField(default=10)
    active = models.BooleanField(default=True)
    
    amount_type = models.CharField(max_length=20, choices=AmountType.choices, default=AmountType.FIXED)
    fixed_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'), help_text="Percentage of basic salary")

    # Financial GL Integration
    debit_account = models.ForeignKey('finance.ChartOfAccount', null=True, blank=True, on_delete=models.SET_NULL, related_name='salary_rule_debits')
    credit_account = models.ForeignKey('finance.ChartOfAccount', null=True, blank=True, on_delete=models.SET_NULL, related_name='salary_rule_credits')

    class Meta:
        db_table = 'payroll_salary_rules'
        ordering = ['sequence']

    def __str__(self):
        return self.name

class SalaryStructure(AuditedModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, unique=True)
    rules = models.ManyToManyField(SalaryRule, related_name='structures')

    class Meta:
        db_table = 'payroll_salary_structures'

    def __str__(self):
        return self.name

class Payslip(TimeStampedModel):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        DONE = 'done', 'Done'
        PAID = 'paid', 'Paid'
        CANCELLED = 'cancelled', 'Cancelled'

    payroll_run = models.ForeignKey(PayrollRun, on_delete=models.CASCADE, related_name='payslips', null=True, blank=True)
    employee = models.ForeignKey('hr.Employee', on_delete=models.PROTECT, related_name='payslips')
    contract = models.ForeignKey('hr.EmployeeContract', on_delete=models.SET_NULL, null=True, blank=True, related_name='payslips')
    structure = models.ForeignKey(SalaryStructure, on_delete=models.SET_NULL, null=True, blank=True)
    
    date_from = models.DateField()
    date_to = models.DateField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    
    net_amount = models.DecimalField(max_digits=15, decimal_places=2, default=Decimal('0.00'))
    payment_reference = models.CharField(max_length=100, blank=True)
    bank_account_snapshot = models.CharField(max_length=255, blank=True, help_text="Snapshot of bank details at time of processing")

    class Meta:
        db_table = 'payroll_payslips'
        ordering = ['-date_from']

    def __str__(self):
        return f"Payslip {self.employee.full_name} ({self.date_from} - {self.date_to})"

class PayslipLine(TimeStampedModel):
    payslip = models.ForeignKey(Payslip, on_delete=models.CASCADE, related_name='lines')
    salary_rule = models.ForeignKey(SalaryRule, on_delete=models.PROTECT)
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50)
    category = models.CharField(max_length=20)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    total = models.DecimalField(max_digits=15, decimal_places=2)

    class Meta:
        db_table = 'payroll_payslip_lines'
        ordering = ['payslip', 'salary_rule__sequence']

    def __str__(self):
        return f"{self.payslip.employee.full_name} - {self.name}"
