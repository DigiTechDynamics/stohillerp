"""
Stohil Properties - HR Module Models
Employee management, agent profiles, payroll basics.
"""
import uuid
from decimal import Decimal
from django.db import models
from apps.core.models import AuditedModel, TimeStampedModel


class Department(TimeStampedModel):
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, unique=True)
    manager = models.ForeignKey('Employee', null=True, blank=True, on_delete=models.SET_NULL, related_name='managed_department')

    class Meta:
        db_table = 'hr_departments'

    def __str__(self):
        return self.name


class Employee(AuditedModel):
    """Employee / Agent profile. Links to User account for system access."""

    class EmploymentType(models.TextChoices):
        FULL_TIME = 'full_time', 'Full-Time'
        PART_TIME = 'part_time', 'Part-Time'
        CONTRACT = 'contract', 'Contract'
        COMMISSION_ONLY = 'commission_only', 'Commission Only'
        INTERN = 'intern', 'Intern'

    class EmployeeStatus(models.TextChoices):
        ACTIVE = 'active', 'Active'
        ON_LEAVE = 'on_leave', 'On Leave'
        SUSPENDED = 'suspended', 'Suspended'
        TERMINATED = 'terminated', 'Terminated'

    # Identity
    employee_number = models.CharField(max_length=20, unique=True)
    user = models.OneToOneField('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='employee')
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    id_number = models.CharField(max_length=20, blank=True)
    email = models.EmailField()
    phone = models.CharField(max_length=20, blank=True)
    photo = models.ImageField(upload_to='employees/photos/', null=True, blank=True)

    # Job
    department = models.ForeignKey(Department, null=True, blank=True, on_delete=models.SET_NULL)
    job_title = models.CharField(max_length=100)
    employment_type = models.CharField(max_length=20, choices=EmploymentType.choices, default=EmploymentType.FULL_TIME)
    status = models.CharField(max_length=20, choices=EmployeeStatus.choices, default=EmployeeStatus.ACTIVE)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    reports_to = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='direct_reports')

    # Compensation
    basic_salary = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('50.00'), help_text='% of company commission earned by agent')

    # Agent-specific (EAAB registration)
    fidelity_fund_number = models.CharField(max_length=50, blank=True)
    fidelity_fund_expiry = models.DateField(null=True, blank=True)
    principal_agent = models.BooleanField(default=False)

    # Bank details for commission payments
    bank_name = models.CharField(max_length=100, blank=True)
    bank_account_number = models.CharField(max_length=50, blank=True)
    bank_branch_code = models.CharField(max_length=20, blank=True)

    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'hr_employees'
        ordering = ['last_name', 'first_name']

    def __str__(self):
        return f'{self.full_name} ({self.employee_number})'

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()

    def save(self, *args, **kwargs):
        if not self.employee_number:
            from apps.core.services.number_sequence import NumberSequenceService
            self.employee_number = NumberSequenceService.get_next_number("Employee", prefix="EMP-", padding=4)
        super().save(*args, **kwargs)


class LeaveRequest(AuditedModel):
    """Employee leave requests and approvals."""

    class LeaveType(models.TextChoices):
        ANNUAL = 'annual', 'Annual Leave'
        SICK = 'sick', 'Sick Leave'
        FAMILY_RESPONSIBILITY = 'family', 'Family Responsibility'
        MATERNITY = 'maternity', 'Maternity Leave'
        STUDY = 'study', 'Study Leave'
        UNPAID = 'unpaid', 'Unpaid Leave'

    class LeaveStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        CANCELLED = 'cancelled', 'Cancelled'

    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='leave_requests')
    leave_type = models.CharField(max_length=20, choices=LeaveType.choices)
    start_date = models.DateField()
    end_date = models.DateField()
    days_requested = models.DecimalField(max_digits=5, decimal_places=1)
    status = models.CharField(max_length=10, choices=LeaveStatus.choices, default=LeaveStatus.PENDING)
    reason = models.TextField(blank=True)
    approved_by = models.ForeignKey(Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_leaves')

    class Meta:
        db_table = 'hr_leave_requests'
        ordering = ['-start_date']
