"""Online payments made from the tenant portal."""

import uuid

from django.db import models


class OnlinePayment(models.Model):
    class Status(models.TextChoices):
        CREATED = 'created', 'Created'
        PENDING = 'pending', 'Awaiting payment'
        PAID = 'paid', 'Paid'
        FAILED = 'failed', 'Failed / cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reference = models.CharField(max_length=40, unique=True)
    contact = models.ForeignKey('crm.Contact', on_delete=models.PROTECT, related_name='online_payments')
    customer = models.ForeignKey('finance.CustomerProfile', on_delete=models.PROTECT, related_name='online_payments')
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, null=True, blank=True)
    # [{"invoice": <CustomerInvoice id>, "amount": "123.00"}] - what the payment settles.
    allocations = models.JSONField(default=list)
    gateway = models.CharField(max_length=20)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.CREATED)
    gateway_reference = models.CharField(max_length=100, blank=True)
    redirect_url = models.URLField(max_length=500, blank=True)
    poll_url = models.URLField(max_length=500, blank=True)
    gateway_status = models.CharField(max_length=50, blank=True)
    # Set once the money is receipted in AR / rentals (idempotency guard).
    receipted = models.BooleanField(default=False)
    receipt_reference = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'portal_online_payments'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.reference} {self.amount} ({self.status})'
