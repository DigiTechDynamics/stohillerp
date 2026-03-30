"""
Stohil Properties - Commission Management Module
Agent commission calculation, approval, and payment workflow.
"""
from decimal import Decimal
from django.db import models
from apps.core.models import AuditedModel, TimeStampedModel


class CommissionStructure(TimeStampedModel):
    """Commission rate configurations for different transaction types."""
    class CalculationType(models.TextChoices):
        STANDARD = 'standard', 'Standard Flat Rate'
        TIERED = 'tiered', 'Tiered Target'

    name = models.CharField(max_length=100)
    calculation_type = models.CharField(max_length=20, choices=CalculationType.choices, default=CalculationType.STANDARD)
    base_rate = models.DecimalField(max_digits=5, decimal_places=2, help_text='Base % rate', default=Decimal('0.00'))
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = 'commission_structures'

    def __str__(self):
        return f'{self.name} ({self.base_rate}%)'


class CommissionTier(models.Model):
    structure = models.ForeignKey(CommissionStructure, related_name='tiers', on_delete=models.CASCADE)
    threshold_amount = models.DecimalField(max_digits=12, decimal_places=2)
    rate_percentage = models.DecimalField(max_digits=5, decimal_places=2)

    class Meta:
        db_table = 'commission_tiers'
        ordering = ['threshold_amount']


class CommissionRecord(AuditedModel):
    """
    Individual commission record for an agent on a transaction.
    Triggers AccountingService.post_commission_payment() on approval.
    """

    class CommissionStatus(models.TextChoices):
        CALCULATED = 'calculated', 'Calculated'
        PENDING_APPROVAL = 'pending', 'Pending Approval'
        APPROVED = 'approved', 'Approved'
        PAID = 'paid', 'Paid'
        DISPUTED = 'disputed', 'Disputed'
        CANCELLED = 'cancelled', 'Cancelled'

    reference = models.CharField(max_length=50, unique=True)
    agent = models.ForeignKey('hr.Employee', on_delete=models.PROTECT, related_name='commissions')
    transaction_type = models.CharField(max_length=20, choices=[('sale', 'Sale'), ('rental', 'Rental')])
    sale_transaction = models.ForeignKey('sales.SaleTransaction', null=True, blank=True, on_delete=models.SET_NULL)
    lease = models.ForeignKey('rentals.Lease', null=True, blank=True, on_delete=models.SET_NULL)
    property = models.ForeignKey('properties.Property', on_delete=models.PROTECT)

    # Calculation
    transaction_amount = models.DecimalField(max_digits=15, decimal_places=2)
    company_commission_rate = models.DecimalField(max_digits=5, decimal_places=2)
    company_commission_amount = models.DecimalField(max_digits=12, decimal_places=2)
    agent_split_rate = models.DecimalField(max_digits=5, decimal_places=2)
    gross_commission = models.DecimalField(max_digits=12, decimal_places=2)
    deductions = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    net_commission = models.DecimalField(max_digits=12, decimal_places=2)

    # Status
    status = models.CharField(max_length=20, choices=CommissionStatus.choices, default=CommissionStatus.CALCULATED)
    approved_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_commissions')
    approved_date = models.DateField(null=True, blank=True)
    payment_date = models.DateField(null=True, blank=True)
    payment_reference = models.CharField(max_length=100, blank=True)

    # Finance linkage
    journal_entry = models.ForeignKey('finance.JournalEntry', null=True, blank=True, on_delete=models.SET_NULL)

    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'commission_records'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.reference} - {self.agent.full_name} - R{self.net_commission}'
