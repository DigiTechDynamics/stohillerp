"""
Settlement (allocation) of AR and AP documents.

Each row applies part of a credit source (receipt/payment, or credit note) to
an invoice, writes an invoice off, or refunds unapplied credit. The invoice
`amount_paid` counters remain the fast read path; these rows are the audit
trail of *which* cash settled *which* invoice, as in BC's applied entries or
Odoo's reconciliation. Amounts are in the documents' (shared) currency.
"""

import uuid

from django.db import models

from apps.core.models import AuditedModel


class Allocation(AuditedModel):
    class Kind(models.TextChoices):
        PAYMENT = 'payment', 'Receipt / payment applied'
        CREDIT_NOTE = 'credit_note', 'Credit note applied'
        WRITE_OFF = 'write_off', 'Written off'
        REFUND = 'refund', 'Credit refunded'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=20, choices=Kind.choices)
    allocation_date = models.DateField()
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    # Realised exchange difference in base currency (positive = gain).
    fx_difference = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    journal_entry = models.ForeignKey('finance.JournalEntry', null=True, blank=True, on_delete=models.PROTECT,
                                      related_name='+')
    notes = models.CharField(max_length=255, blank=True)

    class Meta:
        abstract = True


class ARAllocation(Allocation):
    invoice = models.ForeignKey('finance.CustomerInvoice', null=True, blank=True, on_delete=models.PROTECT,
                                related_name='allocations')
    receipt = models.ForeignKey('finance.CustomerReceipt', null=True, blank=True, on_delete=models.PROTECT,
                                related_name='allocations')
    credit_note = models.ForeignKey('finance.CustomerInvoice', null=True, blank=True, on_delete=models.PROTECT,
                                    related_name='applied_allocations')

    class Meta:
        db_table = 'finance_ar_allocations'
        ordering = ['allocation_date', 'created_at']


class APAllocation(Allocation):
    invoice = models.ForeignKey('finance.SupplierInvoice', null=True, blank=True, on_delete=models.PROTECT,
                                related_name='allocations')
    payment = models.ForeignKey('finance.SupplierPayment', null=True, blank=True, on_delete=models.PROTECT,
                                related_name='allocations')
    credit_note = models.ForeignKey('finance.SupplierInvoice', null=True, blank=True, on_delete=models.PROTECT,
                                    related_name='applied_allocations')

    class Meta:
        db_table = 'finance_ap_allocations'
        ordering = ['allocation_date', 'created_at']
