"""
Status of the outside services the system depends on (UAT GAP-18 to GAP-21):
email, SMS, online payments, and the providers that are manual by design.

  GET  core/integrations/              status of each, and what to set
  POST core/integrations/test-email/   {"to"}       send a test email
  POST core/integrations/test-sms/     {"to"}       send a test SMS

The same checks run at startup (`manage.py check --deploy` and when the server
starts) as warnings, so a deployment that silently drops email is noticed.
"""

from django.conf import settings
from django.core import checks

CONSOLE_EMAIL = 'django.core.mail.backends.console.EmailBackend'
LOG_SMS = 'apps.notifications.services.LogSMSBackend'


def statuses():
    email_live = settings.EMAIL_BACKEND not in (CONSOLE_EMAIL, 'django.core.mail.backends.locmem.EmailBackend')
    sms_live = settings.SMS_BACKEND != LOG_SMS
    paynow_live = bool(settings.PAYNOW_INTEGRATION_ID and settings.PAYNOW_INTEGRATION_KEY)
    gateway = getattr(settings, 'PAYMENT_GATEWAY', 'paynow')
    return [
        {
            'key': 'email', 'name': 'Email', 'configured': email_live,
            'detail': (f'SMTP via {settings.EMAIL_HOST}:{settings.EMAIL_PORT}, from {settings.DEFAULT_FROM_EMAIL}'
                       if email_live else 'Emails are only written to the server log; nobody receives them.'),
            'how': 'Set EMAIL_HOST, EMAIL_PORT, EMAIL_HOST_USER, EMAIL_HOST_PASSWORD and DEFAULT_FROM_EMAIL.',
            'testable': True,
        },
        {
            'key': 'sms', 'name': 'SMS', 'configured': sms_live,
            'detail': (f'Gateway {settings.SMS_BACKEND.rsplit(".", 1)[-1]}' if sms_live
                       else 'SMS messages are recorded in the message history but not sent.'),
            'how': ('Set SMS_BACKEND to apps.notifications.services.TwilioSMSBackend (with SMS_TWILIO_ACCOUNT_SID, '
                    'SMS_TWILIO_AUTH_TOKEN, SMS_FROM) or apps.notifications.services.HTTPSMSBackend (with '
                    'SMS_HTTP_URL, SMS_HTTP_TOKEN, SMS_FROM).'),
            'testable': True,
        },
        {
            'key': 'payments', 'name': 'Online payments (Paynow)',
            'configured': paynow_live or gateway == 'test',
            'detail': ('Test gateway: payments complete without money moving.' if gateway == 'test'
                       else 'Paynow is configured.' if paynow_live
                       else 'Tenants cannot pay online: Paynow keys are missing.'),
            'how': 'Set PAYNOW_INTEGRATION_ID and PAYNOW_INTEGRATION_KEY from your Paynow merchant account, '
                   'and ONLINE_PAYMENTS_BANK_ACCOUNT to the bank account code that receives them.',
            'testable': False,
        },
        {
            'key': 'credit_checks', 'name': 'Credit checks', 'configured': False, 'manual': True,
            'detail': 'Manual: request the check from your bureau and record the result on the application.',
            'how': 'No bureau is connected. Connecting one needs an agreement and API access from the bureau.',
            'testable': False,
        },
        {
            'key': 'esignature', 'name': 'E-signatures', 'configured': False, 'manual': True,
            'detail': 'Manual: send the lease for signature, then mark it signed and upload the signed copy.',
            'how': 'No e-signature provider is connected. Connecting one needs an account with the provider.',
            'testable': False,
        },
        {
            'key': 'cpi', 'name': 'CPI figures', 'configured': False, 'manual': True,
            'detail': 'Manual: enter the monthly index under Property settings > CPI (ZIMSTAT publishes it).',
            'how': 'No feed is connected; ZIMSTAT has no public API, so monthly entry is the expected process.',
            'testable': False,
        },
    ]


@checks.register(checks.Tags.compatibility)
def integration_checks(app_configs, **kwargs):
    if settings.DEBUG or getattr(settings, 'TESTING', False):
        return []
    warnings = []
    for item in statuses():
        if not item['configured'] and not item.get('manual'):
            warnings.append(checks.Warning(f"{item['name']} is not configured: {item['detail']}", hint=item['how'],
                                           id=f"stohill.W_{item['key'].upper()}"))
    return warnings


# ─── API (core/integrations/, access administrators) ─────────────────────────

from rest_framework.exceptions import ValidationError  # noqa: E402
from rest_framework.response import Response  # noqa: E402
from rest_framework.views import APIView  # noqa: E402


class IntegrationsView(APIView):
    def get(self, request):
        return Response(statuses())


class TestEmailView(APIView):
    def post(self, request):
        from apps.notifications.services import send_email

        to = (request.data.get('to') or request.user.email or '').strip()
        if not to:
            raise ValidationError({'to': 'Give an email address.'})
        message = send_email(to, f"Test email from {settings.COMPANY_CONFIG['name']}",
                             'This is a test from the ERP. If you can read it, outgoing email works.',
                             category='test', user=request.user)
        return Response({'status': message.status, 'error': message.error, 'recipient': to})


class TestSMSView(APIView):
    def post(self, request):
        from apps.notifications.services import send_sms

        to = (request.data.get('to') or '').strip()
        if not to:
            raise ValidationError({'to': 'Give a mobile number in international format, e.g. +263771234567.'})
        message = send_sms(to, f"Test SMS from {settings.COMPANY_CONFIG['name']}. Outgoing SMS works.",
                           category='test', user=request.user)
        return Response({'status': message.status, 'error': message.error, 'recipient': to})
