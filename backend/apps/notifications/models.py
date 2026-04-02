import uuid
from django.db import models
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType

class Notification(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Level(models.TextChoices):
        INFO = 'info', 'Information'
        SUCCESS = 'success', 'Success'
        WARNING = 'warning', 'Warning'
        ERROR = 'error', 'Error'

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
        db_index=True
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='actions_triggered'
    )
    verb = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    
    target_content_type = models.ForeignKey(
        ContentType, 
        on_delete=models.CASCADE, 
        null=True, 
        blank=True
    )
    target_object_id = models.CharField(max_length=255, null=True, blank=True)
    target = GenericForeignKey('target_content_type', 'target_object_id')
    
    level = models.CharField(
        max_length=20, 
        choices=Level.choices, 
        default=Level.INFO
    )
    is_read = models.BooleanField(default=False, db_index=True)
    module = models.CharField(max_length=50, blank=True)
    link = models.CharField(max_length=500, blank=True)

    class Meta:
        db_table = 'core_notifications'
        ordering = ['-created_at']

    def __str__(self):
        if self.actor:
            return f"{self.actor} {self.verb} {self.target or ''}"
        return f"{self.verb} {self.target or ''}"
