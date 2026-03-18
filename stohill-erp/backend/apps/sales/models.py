"""
Stohil Properties - Sales Module Models
Property sale transactions, offers, transfer workflow.
"""
import uuid
from decimal import Decimal
from django.db import models
from apps.core.models import AuditedModel, TimeStampedModel


class SaleTransaction(AuditedModel):
    """
    Completed or in-progress property sale.
    On completion triggers AccountingService.post_sale_transaction().
    """

    class TransactionStatus(models.TextChoices):
        OFFER_SUBMITTED = 'offer_submitted', 'Offer Submitted'
        OFFER_ACCEPTED = 'offer_accepted', 'Offer Accepted'
        SUSPENSIVE_CONDITIONS = 'suspensive', 'Suspensive Conditions'
        BOND_APPROVED = 'bond_approved', 'Bond Approved'
        TRANSFER_IN_PROGRESS = 'transfer', 'Transfer in Progress'
        REGISTERED = 'registered', 'Registered / Complete'
        CANCELLED = 'cancelled', 'Cancelled / Fallen Through'

    # References
    sale_reference = models.CharField(max_length=50, unique=True, db_index=True)
    property = models.ForeignKey('properties.Property', on_delete=models.PROTECT, related_name='sales')
    buyer = models.ForeignKey('crm.Contact', on_delete=models.PROTECT, related_name='purchases')
    seller = models.ForeignKey('crm.Contact', null=True, blank=True, on_delete=models.SET_NULL, related_name='sales')
    opportunity = models.ForeignKey('crm.Opportunity', null=True, blank=True, on_delete=models.SET_NULL)
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='sales', null=True)

    # Agents
    listing_agent = models.ForeignKey('hr.Employee', null=True, blank=True, on_delete=models.SET_NULL, related_name='listing_sales')
    selling_agent = models.ForeignKey('hr.Employee', null=True, blank=True, on_delete=models.SET_NULL, related_name='selling_sales')

    # Financial
    sale_price = models.DecimalField(max_digits=15, decimal_places=2)
    deposit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    deposit_due_date = models.DateField(null=True, blank=True)
    deposit_paid_date = models.DateField(null=True, blank=True)
    commission_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('7.00'), help_text='% commission')
    commission_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # Bond
    bond_required = models.BooleanField(default=True)
    bond_amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    bond_institution = models.CharField(max_length=100, blank=True)
    bond_approved_date = models.DateField(null=True, blank=True)
    bond_granted = models.BooleanField(null=True, blank=True)

    # Dates
    offer_date = models.DateField()
    accepted_date = models.DateField(null=True, blank=True)
    occupation_date = models.DateField(null=True, blank=True)
    transfer_date = models.DateField(null=True, blank=True)

    # Attorney
    transferring_attorney = models.CharField(max_length=200, blank=True)
    bond_attorney = models.CharField(max_length=200, blank=True)

    # Status
    status = models.CharField(max_length=30, choices=TransactionStatus.choices, default=TransactionStatus.OFFER_SUBMITTED)

    # Finance linkage
    journal_entry = models.OneToOneField('finance.JournalEntry', null=True, blank=True, on_delete=models.SET_NULL)
    is_posted_to_finance = models.BooleanField(default=False)

    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'sales_transactions'
        ordering = ['-offer_date']

    def __str__(self):
        return f'{self.sale_reference} - {self.property.reference_number}'

    def calculate_commission(self):
        """Calculate commission based on rate."""
        self.commission_amount = (self.sale_price * self.commission_rate / Decimal('100'))
        return self.commission_amount
