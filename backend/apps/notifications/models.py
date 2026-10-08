"""Every email and SMS the system sends, with its outcome."""

import uuid

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


class Notification(models.Model):
    """An in-app notification for one user, shown under the bell in the top bar."""

    class Level(models.TextChoices):
        INFO = 'info', 'Information'
        ACTION = 'action', 'Action needed'
        WARNING = 'warning', 'Warning'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    recipient = models.ForeignKey('core.User', on_delete=models.CASCADE, related_name='notifications')
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    # Where clicking the notification goes in the web app, e.g. /finance/approvals.
    link = models.CharField(max_length=300, blank=True)
    level = models.CharField(max_length=10, choices=Level.choices, default=Level.INFO)
    category = models.CharField(max_length=50, blank=True, help_text='e.g. batch_approval, leave_request')
    # Identifies the subject, so a repeated event doesn't add a second unread copy.
    related_object = models.CharField(max_length=100, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        db_table = 'notifications_inbox'
        ordering = ['-created_at']
        indexes = [models.Index(fields=['recipient', 'read_at', 'created_at'])]

    def __str__(self):
        return f'{self.recipient_id}: {self.title}'

    @property
    def is_read(self):
        return self.read_at is not None
