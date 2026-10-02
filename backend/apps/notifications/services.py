"""
Sending email and SMS.

Email goes through Django's configured email backend (SMTP in production).
SMS goes through the backend named in settings.SMS_BACKEND. The default,
LogSMSBackend, sends nothing: it records the message as "logged" so the
history is complete and a real gateway can be added later by writing a class
with a send(to, text) method returning a provider reference and setting
SMS_BACKEND to its dotted path.

Every attempt is stored as a notifications.Message.
"""

import logging

from django.conf import settings
from django.core.mail import EmailMessage
from django.utils.module_loading import import_string

from apps.notifications.models import Message

logger = logging.getLogger('stohill.notifications')


class SMSError(Exception):
    pass


class LogSMSBackend:
    """No gateway configured: record the SMS without sending it."""
    name = 'log'
    delivers = False

    def send(self, to, text):
        logger.info('SMS (not sent, no gateway) to %s: %s', to, text[:80])
        return ''


def sms_backend():
    return import_string(getattr(settings, 'SMS_BACKEND', 'apps.notifications.services.LogSMSBackend'))()


def send_email(to, subject, body, *, contact=None, category='', related='', attachments=(), user=None):
    """attachments: [(filename, bytes, mimetype)]"""
    if not to:
        return Message.objects.create(channel=Message.Channel.EMAIL, recipient='', subject=subject, body=body,
                                      status=Message.Status.SKIPPED, error='No email address.', contact=contact,
                                      category=category, related_object=related, sent_by=user)
    email = EmailMessage(subject=subject, body=body, from_email=settings.DEFAULT_FROM_EMAIL, to=[to])
    for name, content, mimetype in attachments:
        email.attach(name, content, mimetype)
    try:
        email.send(fail_silently=False)
        status, error = Message.Status.SENT, ''
    except Exception as e:  # recorded, never raised: one bad address must not stop a bulk run
        logger.warning('Email to %s failed: %s', to, e)
        status, error = Message.Status.FAILED, str(e)
    return Message.objects.create(channel=Message.Channel.EMAIL, recipient=to, subject=subject, body=body,
                                  status=status, error=error, provider='email', contact=contact,
                                  category=category, related_object=related, sent_by=user)


def send_sms(to, text, *, contact=None, category='', related='', user=None):
    if not to:
        return Message.objects.create(channel=Message.Channel.SMS, recipient='', body=text,
                                      status=Message.Status.SKIPPED, error='No mobile number.', contact=contact,
                                      category=category, related_object=related, sent_by=user)
    backend = sms_backend()
    try:
        reference = backend.send(to, text)
        status = Message.Status.SENT if getattr(backend, 'delivers', True) else Message.Status.LOGGED
        error = ''
    except Exception as e:
        logger.warning('SMS to %s failed: %s', to, e)
        reference, status, error = '', Message.Status.FAILED, str(e)
    return Message.objects.create(channel=Message.Channel.SMS, recipient=to, body=text, status=status, error=error,
                                  provider=getattr(backend, 'name', backend.__class__.__name__),
                                  provider_reference=reference or '', contact=contact, category=category,
                                  related_object=related, sent_by=user)


def notify_contact(contact, subject, body, *, channels=('email',), category='', related='', attachments=(),
                   user=None):
    """Send to a CRM contact on each channel; returns the Message records."""
    sent = []
    if 'email' in channels:
        sent.append(send_email(contact.email if contact else '', subject, body, contact=contact, category=category,
                               related=related, attachments=attachments, user=user))
    if 'sms' in channels:
        mobile = getattr(contact, 'phone_mobile', '') if contact else ''
        sent.append(send_sms(mobile, f'{subject}: {body}' if subject else body, contact=contact,
                             category=category, related=related, user=user))
    return sent
