"""
Configurable approval workflow (BC/D365-style approval rules) for AP
documents: each active rule whose threshold the document meets must be
approved by a user holding the rule's role, in sequence, before the document
can be posted. The creator can never approve their own document.
"""

import uuid

from django.db import models

from apps.core.models import TimeStampedModel


class ApprovalRule(TimeStampedModel):
    class DocumentType(models.TextChoices):
        SUPPLIER_INVOICE = 'supplier_invoice', 'Supplier invoice / credit note'
        SUPPLIER_PAYMENT = 'supplier_payment', 'Supplier payment'

    name = models.CharField(max_length=150)
    document_type = models.CharField(max_length=30, choices=DocumentType.choices)
    # Applies when the document's base-currency amount is at least this.
    min_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    role = models.ForeignKey('core.Role', on_delete=models.PROTECT, related_name='approval_rules')
    sequence = models.PositiveSmallIntegerField(default=10)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'finance_approval_rules'
        ordering = ['document_type', 'sequence', 'min_amount']

    def __str__(self):
        return f'{self.name} ({self.get_document_type_display()} >= {self.min_amount})'


class ApprovalRecord(models.Model):
    class Decision(models.TextChoices):
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    document_type = models.CharField(max_length=30, choices=ApprovalRule.DocumentType.choices)
    object_id = models.UUIDField(db_index=True)
    rule = models.ForeignKey(ApprovalRule, null=True, blank=True, on_delete=models.PROTECT)
    user = models.ForeignKey('core.User', on_delete=models.PROTECT, related_name='approval_decisions')
    decision = models.CharField(max_length=10, choices=Decision.choices)
    comment = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'finance_approval_records'
        ordering = ['created_at']
