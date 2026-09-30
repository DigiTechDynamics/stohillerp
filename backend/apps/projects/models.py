"""
Development / project accounting.

A project (e.g. building units on a stand, a refurbishment) gets its own cost
centre. Costs are posted to a work-in-progress (WIP) balance sheet account
tagged with that cost centre, from supplier invoices, purchase orders or
journals. When the work is done the WIP is capitalised: into property
inventory (stock for sale, which also raises the property's cost so the sale
books the right cost of sale) or into a fixed asset (investment property,
depreciated like any other asset).
"""

from decimal import Decimal

from django.db import models

from apps.core.models import AuditedModel


class Project(AuditedModel):
    class Status(models.TextChoices):
        PLANNING = 'planning', 'Planning'
        ACTIVE = 'active', 'In progress'
        COMPLETED = 'completed', 'Completed (capitalised)'
        CANCELLED = 'cancelled', 'Cancelled'

    class CapitaliseTo(models.TextChoices):
        INVENTORY = 'inventory', 'Property inventory (for sale)'
        FIXED_ASSET = 'fixed_asset', 'Fixed asset (held / investment)'

    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=200)
    property = models.ForeignKey('properties.Property', null=True, blank=True, on_delete=models.PROTECT,
                                 related_name='projects')
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PLANNING)
    start_date = models.DateField(null=True, blank=True)
    end_date = models.DateField(null=True, blank=True)
    budget = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    cost_center = models.OneToOneField('finance.CostCenter', on_delete=models.PROTECT, related_name='project')
    wip_account = models.ForeignKey('finance.ChartOfAccount', on_delete=models.PROTECT, related_name='wip_projects')
    capitalise_to = models.CharField(max_length=20, choices=CapitaliseTo.choices, default=CapitaliseTo.INVENTORY)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'projects'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.code} - {self.name}'


class ProjectCapitalisation(AuditedModel):
    project = models.ForeignKey(Project, on_delete=models.PROTECT, related_name='capitalisations')
    capitalisation_date = models.DateField()
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    target = models.CharField(max_length=20, choices=Project.CapitaliseTo.choices)
    journal_entry = models.ForeignKey('finance.JournalEntry', on_delete=models.PROTECT, related_name='+')
    fixed_asset = models.ForeignKey('fixed_assets.FixedAsset', null=True, blank=True, on_delete=models.PROTECT)

    class Meta:
        db_table = 'project_capitalisations'
        ordering = ['-capitalisation_date']
