"""Every email and SMS the system sends, with its outcome."""

from django.db import models

from apps.core.models import TimeStampedModel


class Message(TimeStampedModel):
    class Channel(models.TextChoices):
        EMAIL = 'email', 'Email'
        SMS = 'sms', 'SMS'

    class Status(models.TextChoices):
        SENT = 'sent', 'Sent'
        LOGGED = 'logged', 'Logged only (no SMS gateway configured)'
        FAILED = 'failed', 'Failed'
        SKIPPED = 'skipped', 'Skipped (no address)'

    channel = models.CharField(max_length=10, choices=Channel.choices)
    recipient = models.CharField(max_length=255, blank=True)
    subject = models.CharField(max_length=255, blank=True)
    body = models.TextField()
    status = models.CharField(max_length=10, choices=Status.choices)
    error = models.TextField(blank=True)
    provider = models.CharField(max_length=50, blank=True)
    provider_reference = models.CharField(max_length=100, blank=True)
    # What the message is about, for history on the related record.
    contact = models.ForeignKey('crm.Contact', null=True, blank=True, on_delete=models.SET_NULL,
                                related_name='messages')
    category = models.CharField(max_length=50, blank=True, help_text='e.g. rent_reminder, arrears, bulk')
    related_object = models.CharField(max_length=100, blank=True, help_text='e.g. lease:LSE-00012')
    sent_by = models.ForeignKey('core.User', null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        db_table = 'notifications_messages'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['category', 'created_at']), models.Index(fields=['contact', 'created_at'])]

    def __str__(self):
        return f'{self.channel} to {self.recipient}: {self.subject or self.body[:40]}'
