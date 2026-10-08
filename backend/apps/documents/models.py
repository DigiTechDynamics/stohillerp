"""
Stohil Properties - Document & Compliance Module
Document management, compliance tracking, FICA, EAAB requirements.
"""
from django.db import models
from apps.core.models import AuditedModel, TimeStampedModel


class DocumentCategory(TimeStampedModel):
    """A document type (title deeds, lease agreements, KYC...), set up under Documents."""
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, unique=True)
    retention_years = models.PositiveSmallIntegerField(default=7)
    description = models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'document_categories'
        ordering = ['sort_order', 'name']
        verbose_name_plural = 'document categories'

    def __str__(self):
        return self.name


class Document(AuditedModel):
    """Central document record with versioning and compliance tracking."""

    class DocumentStatus(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PENDING_SIGNATURE = 'pending_signature', 'Pending Signature'
        SIGNED = 'signed', 'Signed'
        ACTIVE = 'active', 'Active'
        EXPIRED = 'expired', 'Expired'
        ARCHIVED = 'archived', 'Archived'

    title = models.CharField(max_length=300)
    reference = models.CharField(max_length=100, unique=True)
    category = models.ForeignKey(DocumentCategory, on_delete=models.PROTECT)
    status = models.CharField(max_length=20, choices=DocumentStatus.choices, default=DocumentStatus.DRAFT)
    file = models.FileField(upload_to='documents/%Y/%m/')
    file_size = models.BigIntegerField(default=0)
    mime_type = models.CharField(max_length=100, blank=True)
    version = models.PositiveSmallIntegerField(default=1)
    description = models.TextField(blank=True)
    expiry_date = models.DateField(null=True, blank=True)

    # Related entities
    property = models.ForeignKey('properties.Property', null=True, blank=True, on_delete=models.SET_NULL, related_name='documents')
    contact = models.ForeignKey('crm.Contact', null=True, blank=True, on_delete=models.SET_NULL, related_name='documents')
    sale_transaction = models.ForeignKey('sales.SaleTransaction', null=True, blank=True, on_delete=models.SET_NULL)
    lease = models.ForeignKey('rentals.Lease', null=True, blank=True, on_delete=models.SET_NULL)
    employee = models.ForeignKey('hr.Employee', null=True, blank=True, on_delete=models.SET_NULL)

    tags = models.JSONField(default=list, blank=True)
    is_confidential = models.BooleanField(default=False)

    class Meta:
        db_table = 'documents'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.reference} {self.title}'

    def save(self, *args, **kwargs):
        if not self.reference:
            from apps.core.services.number_sequence import NumberSequenceService
            self.reference = NumberSequenceService.get_next_number('Document', prefix='DOC-', padding=5)
            while Document.objects.filter(reference=self.reference).exists():   # imported references
                self.reference = NumberSequenceService.get_next_number('Document', prefix='DOC-', padding=5)
        if self.file and not self.file_size:
            self.file_size = getattr(self.file, 'size', 0) or 0
        if self.file and not self.mime_type:
            import mimetypes
            self.mime_type = (getattr(getattr(self.file, 'file', None), 'content_type', '')
                              or mimetypes.guess_type(self.file.name)[0] or '')[:100]
        super().save(*args, **kwargs)


class ComplianceRequirement(TimeStampedModel):
    """FICA, EAAB, and other regulatory compliance tracking."""
    name = models.CharField(max_length=200)
    regulation = models.CharField(max_length=100)
    applies_to = models.CharField(max_length=20, choices=[
        ('contact', 'Contact / Client'),
        ('employee', 'Employee'),
        ('property', 'Property'),
        ('company', 'Company'),
    ])
    is_mandatory = models.BooleanField(default=True)
    renewal_period_months = models.PositiveSmallIntegerField(null=True, blank=True)
    description = models.TextField(blank=True)

    class Meta:
        db_table = 'compliance_requirements'


class ComplianceRecord(AuditedModel):
    """Tracks compliance status for a specific entity."""

    class ComplianceStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        COMPLIANT = 'compliant', 'Compliant'
        EXPIRING_SOON = 'expiring', 'Expiring Soon'
        EXPIRED = 'expired', 'Expired'
        NON_COMPLIANT = 'non_compliant', 'Non-Compliant'
        EXEMPT = 'exempt', 'Exempt'

    requirement = models.ForeignKey(ComplianceRequirement, on_delete=models.CASCADE)
    contact = models.ForeignKey('crm.Contact', null=True, blank=True, on_delete=models.CASCADE)
    employee = models.ForeignKey('hr.Employee', null=True, blank=True, on_delete=models.CASCADE)
    status = models.CharField(max_length=20, choices=ComplianceStatus.choices, default=ComplianceStatus.PENDING)
    document = models.ForeignKey(Document, null=True, blank=True, on_delete=models.SET_NULL)
    issue_date = models.DateField(null=True, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'compliance_records'
