"""
Recurring journal templates (monthly accruals, rent-free amortisation,
standing allocations). The daily job generates the entries that are due.
"""

from decimal import Decimal

from django.db import models

from apps.core.models import AuditedModel


class RecurringJournal(AuditedModel):
    class Frequency(models.TextChoices):
        MONTHLY = 'monthly', 'Monthly'
        QUARTERLY = 'quarterly', 'Quarterly'
        YEARLY = 'yearly', 'Yearly'

    name = models.CharField(max_length=150)
    description = models.CharField(max_length=500)
    journal = models.ForeignKey('finance.Journal', on_delete=models.PROTECT)
    frequency = models.CharField(max_length=20, choices=Frequency.choices, default=Frequency.MONTHLY)
    next_run_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    # Post immediately, or leave the generated entry in draft for approval.
    auto_post = models.BooleanField(default=False)
    # Reverse each generated entry on the first day of the next period
    # (typical for month-end accruals).
    reverse_next_period = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    last_run_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'finance_recurring_journals'
        ordering = ['next_run_date', 'name']

    def __str__(self):
        return self.name


class RecurringJournalLine(models.Model):
    template = models.ForeignKey(RecurringJournal, on_delete=models.CASCADE, related_name='lines')
    account = models.ForeignKey('finance.ChartOfAccount', on_delete=models.PROTECT)
    side = models.CharField(max_length=10, choices=[('debit', 'Debit'), ('credit', 'Credit')])
    amount = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    description = models.CharField(max_length=255, blank=True)
    cost_center = models.ForeignKey('finance.CostCenter', null=True, blank=True, on_delete=models.PROTECT)
    property_ref = models.ForeignKey('properties.Property', null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = 'finance_recurring_journal_lines'
