"""
Sending email and SMS.

Email goes through Django's configured email backend: SMTP once EMAIL_HOST is
set (see settings), otherwise it is only written to the log.
SMS goes through the backend named in settings.SMS_BACKEND:
  apps.notifications.services.TwilioSMSBackend   Twilio
  apps.notifications.services.HTTPSMSBackend     any JSON HTTP gateway
  apps.notifications.services.LogSMSBackend      (default) records, sends nothing
Another gateway is a class with send(to, text) returning a provider reference.

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


def _post_json(url, payload, headers, timeout=20):
    import json
    from urllib.request import Request, urlopen

    request = Request(url, data=json.dumps(payload).encode(), method='POST',
                      headers={'Content-Type': 'application/json', 'Accept': 'application/json', **headers})
    with urlopen(request, timeout=timeout) as response:   # noqa: S310 - configured gateway URL
        body = response.read().decode() or '{}'
    try:
        return json.loads(body)
    except ValueError:
        return {'raw': body}


class TwilioSMSBackend:
    """
    Twilio. Settings: SMS_TWILIO_ACCOUNT_SID, SMS_TWILIO_AUTH_TOKEN and SMS_FROM
    (a Twilio number or alphanumeric sender ID).
    """
    name = 'twilio'
    delivers = True

    def __init__(self):
        self.sid = getattr(settings, 'SMS_TWILIO_ACCOUNT_SID', '')
        self.token = getattr(settings, 'SMS_TWILIO_AUTH_TOKEN', '')
        self.sender = getattr(settings, 'SMS_FROM', '')
        if not (self.sid and self.token and self.sender):
            raise SMSError('Twilio is not configured (SMS_TWILIO_ACCOUNT_SID, SMS_TWILIO_AUTH_TOKEN, SMS_FROM).')

    def send(self, to, text):
        import base64
        import json
        from urllib.error import HTTPError
        from urllib.parse import urlencode
        from urllib.request import Request, urlopen

        url = f'https://api.twilio.com/2010-04-01/Accounts/{self.sid}/Messages.json'
        auth = base64.b64encode(f'{self.sid}:{self.token}'.encode()).decode()
        request = Request(url, data=urlencode({'To': to, 'From': self.sender, 'Body': text}).encode(), method='POST',
                          headers={'Authorization': f'Basic {auth}',
                                   'Content-Type': 'application/x-www-form-urlencoded'})
        try:
            with urlopen(request, timeout=20) as response:   # noqa: S310 - fixed https URL
                data = json.loads(response.read().decode())
        except HTTPError as e:
            raise SMSError(f'Twilio refused the message: {e.read().decode()[:200]}')
        return data.get('sid', '')


class HTTPSMSBackend:
    """
    Any gateway with a JSON API (local Zimbabwean aggregators, Africa's Talking
    bridges...). POSTs {"to", "message", "from"} to SMS_HTTP_URL with
    "Authorization: Bearer SMS_HTTP_TOKEN"; the reply's "id" (or "message_id")
    is kept as the provider reference.
    """
    name = 'http'
    delivers = True

    def __init__(self):
        self.url = getattr(settings, 'SMS_HTTP_URL', '')
        self.token = getattr(settings, 'SMS_HTTP_TOKEN', '')
        self.sender = getattr(settings, 'SMS_FROM', '')
        if not self.url:
            raise SMSError('The SMS gateway URL is not configured (SMS_HTTP_URL).')

    def send(self, to, text):
        from urllib.error import HTTPError

        headers = {'Authorization': f'Bearer {self.token}'} if self.token else {}
        try:
            data = _post_json(self.url, {'to': to, 'message': text, 'from': self.sender}, headers)
        except HTTPError as e:
            raise SMSError(f'The SMS gateway refused the message: {e.read().decode()[:200]}')
        return str(data.get('id') or data.get('message_id') or '')


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
    backend = None
    try:
        backend = sms_backend()   # a misconfigured gateway is recorded as a failure, not raised
        reference = backend.send(to, text)
        status = Message.Status.SENT if getattr(backend, 'delivers', True) else Message.Status.LOGGED
        error = ''
    except Exception as e:
        logger.warning('SMS to %s failed: %s', to, e)
        reference, status, error = '', Message.Status.FAILED, str(e)
    return Message.objects.create(channel=Message.Channel.SMS, recipient=to, body=text, status=status, error=error,
                                  provider=getattr(backend, 'name', settings.SMS_BACKEND.rsplit('.', 1)[-1]),
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
