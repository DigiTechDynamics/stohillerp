"""
Stohil Properties - CRM Module Models
Contact management, lead pipeline, and Kanban board functionality.
"""

import uuid
from django.db import models  # type: ignore
from apps.core.models import AuditedModel, TimeStampedModel  # type: ignore


class Contact(AuditedModel):
    """
    CRM Contact - can be a Lead, Client, Tenant, Investor, or Seller.
    Central entity linking all human relationships to properties.
    """

    class ContactType(models.TextChoices):
        LEAD = 'lead', 'Lead'
        PROSPECT = 'prospect', 'Prospect'
        BUYER = 'buyer', 'Buyer'
        SELLER = 'seller', 'Seller'
        TENANT = 'tenant', 'Tenant'
        LANDLORD = 'landlord', 'Landlord'
        INVESTOR = 'investor', 'Investor'
        ATTORNEY = 'attorney', 'Attorney'
        BANK = 'bank', 'Bank / Financier'
        OTHER = 'other', 'Other'

    class ContactStatus(models.TextChoices):
        ACTIVE = 'active', 'Active'
        INACTIVE = 'inactive', 'Inactive'
        BLACKLISTED = 'blacklisted', 'Blacklisted'

    class RatingChoices(models.TextChoices):
        HOT = 'hot', 'Hot'
        WARM = 'warm', 'Warm'
        COLD = 'cold', 'Cold'

    # Identity
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    company = models.CharField(max_length=200, blank=True)
    id_number = models.CharField(max_length=20, blank=True)
    passport_number = models.CharField(max_length=30, blank=True)

    # Contact
    email = models.EmailField(blank=True, db_index=True)
    phone_mobile = models.CharField(max_length=20, blank=True)
    phone_work = models.CharField(max_length=20, blank=True)
    phone_home = models.CharField(max_length=20, blank=True)

    # Classification
    contact_type = models.CharField(max_length=20, choices=ContactType.choices, default=ContactType.LEAD)
    status = models.CharField(max_length=20, choices=ContactStatus.choices, default=ContactStatus.ACTIVE)
    rating = models.CharField(max_length=10, choices=RatingChoices.choices, null=True, blank=True)
    source = models.CharField(max_length=100, blank=True, help_text='How did they find us?')

    # Address
    address_line1 = models.CharField(max_length=255, blank=True)
    suburb = models.CharField(max_length=100, blank=True)
    city = models.CharField(max_length=100, blank=True)
    province = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=10, blank=True)

    # Financial
    credit_rating = models.CharField(max_length=10, blank=True)
    affordability = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    annual_income = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)

    # Preferences
    preferred_areas = models.JSONField(default=list, blank=True)
    property_preferences = models.JSONField(default=dict, blank=True)
    budget_min = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    budget_max = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)

    # Assignment
    assigned_agent = models.ForeignKey(
        'hr.Employee', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='contacts'
    )

    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='contacts', null=True, blank=True)

    notes = models.TextField(blank=True)
    avatar = models.ImageField(upload_to='contacts/avatars/', null=True, blank=True)

    # Guarantor Info
    guarantor_name = models.CharField(max_length=200, blank=True)
    guarantor_email = models.EmailField(blank=True)
    guarantor_phone = models.CharField(max_length=20, blank=True)
    guarantor_relationship = models.CharField(max_length=100, blank=True)

    class Meta:
        db_table = 'crm_contacts'
        ordering = ['last_name', 'first_name']
        indexes = [
            models.Index(fields=['contact_type', 'status']),
            models.Index(fields=['assigned_agent']),
        ]

    def __str__(self):
        return self.full_name

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()


class Pipeline(TimeStampedModel):
    """
    Sales/Rental pipeline definition.
    Each pipeline has stages forming a Kanban board.
    """
    name = models.CharField(max_length=100)
    pipeline_type = models.CharField(
        max_length=20,
        choices=[('sale', 'Sales'), ('rental', 'Rental'), ('general', 'General')],
        default='sale'
    )
    is_default = models.BooleanField(default=False)
    description = models.TextField(blank=True)

    class Meta:
        db_table = 'crm_pipelines'

    def __str__(self):
        return self.name


class PipelineStage(TimeStampedModel):
    """
    Individual stage in a Kanban pipeline.
    Deals/Opportunities move through these stages.
    """

    class StageType(models.TextChoices):
        INITIAL = 'initial', 'Initial Contact'
        QUALIFIED = 'qualified', 'Qualified'
        VIEWING = 'viewing', 'Viewing Scheduled'
        OFFER = 'offer', 'Offer Submitted'
        NEGOTIATION = 'negotiation', 'In Negotiation'
        ACCEPTED = 'accepted', 'Offer Accepted'
        DUE_DILIGENCE = 'due_diligence', 'Due Diligence'
        DOCUMENTATION = 'documentation', 'Documentation'
        CLOSING = 'closing', 'Closing'
        WON = 'won', 'Won / Closed'
        LOST = 'lost', 'Lost'

    pipeline = models.ForeignKey(Pipeline, on_delete=models.CASCADE, related_name='stages')
    name = models.CharField(max_length=100)
    stage_type = models.CharField(max_length=20, choices=StageType.choices)
    position = models.PositiveSmallIntegerField(default=0)
    color = models.CharField(max_length=7, default='#E5A645')  # Hex color
    probability = models.PositiveSmallIntegerField(default=0, help_text='% probability of closing')
    is_terminal = models.BooleanField(default=False, help_text='Won or Lost stage')
    is_won = models.BooleanField(default=False)

    class Meta:
        db_table = 'crm_pipeline_stages'
        ordering = ['pipeline', 'position']

    def __str__(self):
        return f'{self.pipeline.name} - {self.name}'


class Opportunity(AuditedModel):
    """
    A sales/rental opportunity (deal) in the pipeline.
    This is the card on the Kanban board.
    """

    class Priority(models.TextChoices):
        LOW = 'low', 'Low'
        MEDIUM = 'medium', 'Medium'
        HIGH = 'high', 'High'
        URGENT = 'urgent', 'Urgent'

    # Identity
    title = models.CharField(max_length=200)
    reference = models.CharField(max_length=50, unique=True)

    # Relationships
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name='opportunities')
    property = models.ForeignKey(
        'properties.Property', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='opportunities'
    )
    pipeline = models.ForeignKey(Pipeline, on_delete=models.CASCADE)
    stage = models.ForeignKey(PipelineStage, on_delete=models.CASCADE, related_name='opportunities')
    assigned_agent = models.ForeignKey(
        'hr.Employee', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='opportunities'
    )

    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='opportunities', null=True, blank=True)

    # Details
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    expected_value = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    expected_close_date = models.DateField(null=True, blank=True)
    probability = models.PositiveSmallIntegerField(default=0)
    notes = models.TextField(blank=True)
    lost_reason = models.CharField(max_length=300, blank=True)

    # Kanban position (for manual reordering within a stage)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'crm_opportunities'
        ordering = ['stage__position', 'position']
        indexes = [models.Index(fields=['stage', 'position'])]

    def __str__(self):
        return f'{self.reference} - {self.title}'


class Activity(AuditedModel):
    """
    Activity log for contacts and opportunities.
    Tracks calls, emails, viewings, meetings, tasks.
    """

    class ActivityType(models.TextChoices):
        CALL = 'call', 'Phone Call'
        EMAIL = 'email', 'Email'
        MEETING = 'meeting', 'Meeting'
        VIEWING = 'viewing', 'Property Viewing'
        TASK = 'task', 'Task'
        NOTE = 'note', 'Note'
        WHATSAPP = 'whatsapp', 'WhatsApp'

    class ActivityStatus(models.TextChoices):
        PLANNED = 'planned', 'Planned'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'
        OVERDUE = 'overdue', 'Overdue'

    contact = models.ForeignKey(Contact, null=True, blank=True, on_delete=models.CASCADE, related_name='activities')
    opportunity = models.ForeignKey(Opportunity, null=True, blank=True, on_delete=models.CASCADE, related_name='activities')
    property = models.ForeignKey('properties.Property', null=True, blank=True, on_delete=models.SET_NULL)
    activity_type = models.CharField(max_length=20, choices=ActivityType.choices)
    status = models.CharField(max_length=20, choices=ActivityStatus.choices, default=ActivityStatus.PLANNED)
    subject = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    due_date = models.DateTimeField(null=True, blank=True)
    completed_date = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveSmallIntegerField(null=True, blank=True)
    assigned_to = models.ForeignKey('hr.Employee', null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = 'crm_activities'
        ordering = ['-created_at']
