"""
Stohil Properties - CRM Module Models
Contact management, lead pipeline, Kanban board, activities, and full Odoo-parity features.
"""

import uuid
import builtins
from django.db import models  # type: ignore
from django.utils import timezone  # type: ignore
from apps.core.models import AuditedModel, TimeStampedModel  # type: ignore


# ─────────────────────────────────────────────────────────────────────────────
# Supporting / Lookup Models
# ─────────────────────────────────────────────────────────────────────────────

class SalesTeam(TimeStampedModel):
    """
    Sales teams for grouping agents and territories.
    """
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    team_leader = models.ForeignKey(
        'hr.Employee', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='led_teams'
    )
    members = models.ManyToManyField('hr.Employee', related_name='sales_teams', blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'crm_sales_teams'
        ordering = ['name']

    def __str__(self):
        return self.name


class LostReason(TimeStampedModel):
    """
    Normalised list of reasons an opportunity can be lost.
    Seeded with common real-estate reasons; can be extended by admin.
    """
    name = models.CharField(max_length=200, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'crm_lost_reasons'
        ordering = ['name']

    def __str__(self):
        return self.name


class EmailTemplate(TimeStampedModel):
    """
    Reusable email body templates for use in Activity email logging.
    """
    name = models.CharField(max_length=100)
    subject = models.CharField(max_length=200, blank=True)
    body = models.TextField()
    created_by = models.ForeignKey(
        'core.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='email_templates'
    )

    class Meta:
        db_table = 'crm_email_templates'
        ordering = ['name']

    def __str__(self):
        return self.name


class CrmTag(TimeStampedModel):
    """
    Flexible tags for leads and opportunities (e.g., 'Retirement', 'Family', 'Investor').
    Inspired by Odoo tags.
    """
    name = models.CharField(max_length=50, unique=True)
    color = models.CharField(max_length=7, default='#E5A645', help_text='Hex color for UI badge')

    class Meta:
        db_table = 'crm_tags'
        ordering = ['name']

    def __str__(self):
        return self.name


# ─────────────────────────────────────────────────────────────────────────────
# Contact
# ─────────────────────────────────────────────────────────────────────────────

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

    # Enrichment (Odoo-style lead enrichment fields)
    linkedin_url = models.URLField(blank=True, help_text='LinkedIn profile URL')
    website = models.URLField(blank=True, help_text='Company or personal website')
    industry = models.CharField(max_length=100, blank=True, help_text='Industry / Sector')
    lead_score = models.PositiveSmallIntegerField(
        default=0,
        help_text='Lead score 0-100 based on activity and profile completeness'
    )

    # Assignment
    assigned_agent = models.ForeignKey(
        'hr.Employee', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='contacts'
    )
    sales_team = models.ForeignKey(
        SalesTeam, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='contacts'
    )

    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='contacts', null=True, blank=True)

    notes = models.TextField(blank=True)
    avatar = models.ImageField(upload_to='contacts/avatars/', null=True, blank=True)

    # SLA Tracking
    last_activity_at = models.DateTimeField(null=True, blank=True)

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
            models.Index(fields=['email']),
        ]

    def __str__(self):
        return self.full_name

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()

    def compute_lead_score(self):
        """
        Compute a 0-100 lead score based on profile completeness + activity.
        Higher score = hotter lead.
        """
        score = 0
        if self.email:
            score += 15
        if self.phone_mobile:
            score += 10
        if self.company:
            score += 10
        if self.budget_min or self.budget_max:
            score += 15
        if self.annual_income:
            score += 10
        if self.rating == 'hot':
            score += 20
        elif self.rating == 'warm':
            score += 10
        activity_count = self.contact_activities.filter(status='completed').count()
        score += min(activity_count * 5, 20)
        self.lead_score = min(score, 100)
        return self.lead_score


class ContactDocument(AuditedModel):
    """
    KYC and compliance documents for a contact.
    """
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name='kyc_documents')
    name = models.CharField(max_length=200, help_text='e.g., ID Copy, Proof of Residence')
    document_type = models.CharField(max_length=50, choices=[
        ('id', 'ID / Passport'),
        ('residence', 'Proof of Residence'),
        ('tax', 'Tax Clearance'),
        ('contract', 'Signed Contract'),
        ('other', 'Other')
    ])
    file = models.FileField(upload_to='crm/documents/')
    expiry_date = models.DateField(null=True, blank=True)
    is_verified = models.BooleanField(default=False)
    verified_by = models.ForeignKey(
        'core.User', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='verified_crm_docs'
    )

    class Meta:
        db_table = 'crm_contact_documents'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.contact.full_name} - {self.name}'


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline & Stages
# ─────────────────────────────────────────────────────────────────────────────

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
        INITIAL = 'initial', 'Initial Contact / Lead'
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
    
    # SLA Logic
    sla_days = models.PositiveSmallIntegerField(default=0, help_text='Maximum days a deal should stay in this stage before alert')

    class Meta:
        db_table = 'crm_pipeline_stages'
        ordering = ['pipeline', 'position']

    def __str__(self):
        return f'{self.pipeline.name} - {self.name}'


# ─────────────────────────────────────────────────────────────────────────────
# Opportunity / Lead
# ─────────────────────────────────────────────────────────────────────────────

class Opportunity(AuditedModel):
    """
    Unified Lead and Opportunity model.
    A 'Lead' is an un-qualified opportunity (contact might not exist yet).
    """

    class Priority(models.TextChoices):
        LOW = '0', 'Low'
        MEDIUM = '1', 'Medium'
        HIGH = '2', 'High'
        URGENT = '3', 'Very High'

    # Identity & Classification
    title = models.CharField(max_length=200, help_text='Lead or Opportunity title')
    reference = models.CharField(max_length=50, unique=True)
    is_lead = models.BooleanField(default=True, help_text='False once converted to an Opportunity')

    # Lead-specific fields (when no Contact is linked yet)
    contact_name = models.CharField(max_length=200, blank=True)
    partner_name = models.CharField(max_length=200, blank=True, help_text='Company Name')
    email_from = models.EmailField(blank=True, db_index=True)
    phone = models.CharField(max_length=20, blank=True)
    mobile = models.CharField(max_length=20, blank=True)

    # Core Relationships
    contact = models.ForeignKey(Contact, on_delete=models.SET_NULL, null=True, blank=True, related_name='contact_opportunities')
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
    sales_team = models.ForeignKey(
        SalesTeam, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='opportunities'
    )

    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='opportunities', null=True, blank=True)
    tags = models.ManyToManyField(CrmTag, blank=True, related_name='opportunities')

    # Financials
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    expected_revenue = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    probability = models.PositiveSmallIntegerField(default=0)
    expected_closing = models.DateField(null=True, blank=True)

    # Closing Info
    date_closed = models.DateTimeField(null=True, blank=True)
    lost_reason = models.ForeignKey(
        LostReason, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='opportunities',
        help_text='Normalised reason why deal was lost'
    )
    lost_reason_text = models.CharField(
        max_length=300, blank=True,
        help_text='Free-text override or additional notes on loss reason'
    )

    # SLA Tracking
    last_activity_at = models.DateTimeField(null=True, blank=True)
    stage_entered_at = models.DateTimeField(default=timezone.now)

    # Kanban position
    position = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'crm_opportunities'
        ordering = ['stage__position', 'position']
        verbose_name_plural = 'opportunities'
        indexes = [models.Index(fields=['stage', 'position'])]

    def __str__(self):
        return f'{self.reference} - {self.title}'

    def save(self, *args, **kwargs):
        if not self.reference:
            prefix = 'LD' if self.is_lead else 'OP'
            import datetime
            self.reference = f"{prefix}-{datetime.datetime.now().strftime('%y%m')}-{uuid.uuid4().hex[:6].upper()}"
        
        # Track stage entries
        if self.pk:
            old_obj = self.__class__.objects.get(pk=self.pk)
            if old_obj.stage != self.stage:
                from django.utils import timezone
                self.stage_entered_at = timezone.now()

        super().save(*args, **kwargs)

    def convert_to_opportunity(self, partner_id=None):
        """Converts lead to opportunity, optionally linking to a partner."""
        self.is_lead = False
        if partner_id:
            self.contact_id = partner_id
        self.save()

    def mark_won(self):
        """Move opportunity to the Won terminal stage."""
        from django.utils import timezone
        won_stage = PipelineStage.objects.filter(pipeline=self.pipeline, is_won=True).first()
        if won_stage:
            self.stage = won_stage
        self.is_lead = False
        self.probability = 100
        self.date_closed = timezone.now()
        self.save(update_fields=['stage', 'is_lead', 'probability', 'date_closed'])

    def mark_lost(self, reason=None, reason_text=''):
        """Move opportunity to the Lost terminal stage."""
        from django.utils import timezone
        lost_stage = PipelineStage.objects.filter(
            pipeline=self.pipeline, is_terminal=True, is_won=False
        ).first()
        if lost_stage:
            self.stage = lost_stage
        self.probability = 0
        self.date_closed = timezone.now()
        if reason:
            self.lost_reason = reason
        self.lost_reason_text = reason_text
        self.save(update_fields=['stage', 'probability', 'date_closed', 'lost_reason', 'lost_reason_text'])

    @builtins.property
    def is_stale(self):
        """Check if deal has exceeded stage SLA."""
        if not self.stage.sla_days or not self.stage_entered_at:
            return False
        from django.utils import timezone
        delta = timezone.now() - self.stage_entered_at
        return delta.days >= self.stage.sla_days


# ─────────────────────────────────────────────────────────────────────────────
# Notes & Activities (Chatter)
# ─────────────────────────────────────────────────────────────────────────────

class CrmNote(AuditedModel):
    """
    Chatter thread messages / notes.
    """
    opportunity = models.ForeignKey(Opportunity, on_delete=models.CASCADE, related_name='opportunity_notes', null=True, blank=True)
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name='contact_notes', null=True, blank=True)
    body = models.TextField()
    is_internal = models.BooleanField(default=True)
    attachment = models.FileField(upload_to='crm/attachments/', null=True, blank=True)

    class Meta:
        db_table = 'crm_notes'
        ordering = ['-created_at']


class Activity(AuditedModel):
    """
    Activity log for leads and opportunities.
    Tracks calls, emails, viewings, meetings, tasks.
    Includes optional email template linkage.
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

    opportunity = models.ForeignKey(Opportunity, on_delete=models.CASCADE, related_name='opportunity_activities', null=True, blank=True)
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name='contact_activities', null=True, blank=True)
    activity_type = models.CharField(max_length=20, choices=ActivityType.choices)
    status = models.CharField(max_length=20, choices=ActivityStatus.choices, default=ActivityStatus.PLANNED)
    subject = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    due_date = models.DateTimeField(null=True, blank=True)
    completed_date = models.DateTimeField(null=True, blank=True)
    assigned_to = models.ForeignKey('hr.Employee', null=True, blank=True, on_delete=models.SET_NULL)

    # Email template linkage
    email_template = models.ForeignKey(
        EmailTemplate, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='activities'
    )

    class Meta:
        db_table = 'crm_activities'
        ordering = ['-due_date']

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        # Update last activity timestamp on target
        from django.utils import timezone
        if self.opportunity:
            self.opportunity.last_activity_at = timezone.now()
            self.opportunity.save(update_fields=['last_activity_at'])
        if self.contact:
            self.contact.last_activity_at = timezone.now()
            self.contact.save(update_fields=['last_activity_at'])
