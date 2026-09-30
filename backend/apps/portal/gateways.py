"""
Payment gateways for tenant online payments.

`PaynowGateway` implements Paynow (Zimbabwe)'s HTTP integration:
  * initiate: POST form fields to /interface/initiatetransaction with a hash;
    the reply carries browserurl (send the payer there) and pollurl.
  * status: Paynow POSTs the result to our result URL, and the poll URL can
    be read at any time; both carry reference, amount, paynowreference,
    pollurl, status and a hash.
  * hash: SHA512 of every field value in the order sent (excluding the hash
    itself) followed by the integration key, as upper-case hex.
Verify the integration in Paynow's test mode with your integration ID/key
before going live.

`TestGateway` completes payments inside the app; it is refused unless
PAYMENT_TEST_GATEWAY_ENABLED is on (development and automated tests only).
"""

import hashlib
import hmac
from dataclasses import dataclass
from urllib.parse import parse_qsl, urlencode
from urllib.request import Request, urlopen

from django.conf import settings

PAID_STATUSES = {'paid', 'awaiting delivery', 'delivered'}
FAILED_STATUSES = {'cancelled', 'failed', 'disputed', 'refunded'}


class GatewayError(Exception):
    pass


@dataclass
class GatewayStatus:
    reference: str
    status: str          # 'paid' | 'failed' | 'pending'
    raw_status: str
    gateway_reference: str = ''
    amount: str = ''


def paynow_hash(values, integration_key: str) -> str:
    joined = ''.join(str(v) for v in values) + integration_key
    return hashlib.sha512(joined.encode('utf-8')).hexdigest().upper()


def _map_status(raw: str) -> str:
    raw = (raw or '').strip().lower()
    if raw in PAID_STATUSES:
        return 'paid'
    if raw in FAILED_STATUSES:
        return 'failed'
    return 'pending'


class PaynowGateway:
    name = 'paynow'
    INITIATE_URL = 'https://www.paynow.co.zw/interface/initiatetransaction'

    def __init__(self):
        self.integration_id = settings.PAYNOW_INTEGRATION_ID
        self.integration_key = settings.PAYNOW_INTEGRATION_KEY
        if not (self.integration_id and self.integration_key):
            raise GatewayError('Online payments are not configured (PAYNOW_INTEGRATION_ID / _KEY).')

    def _post(self, url, fields):
        request = Request(url, data=urlencode(fields).encode(), method='POST',
                          headers={'Content-Type': 'application/x-www-form-urlencoded'})
        with urlopen(request, timeout=30) as response:   # noqa: S310 - fixed https URL / gateway poll URL
            return response.read().decode()

    def _verify(self, pairs):
        """pairs: ordered (key, value) as received; last or any 'hash' field is checked."""
        received = dict(pairs).get('hash', '')
        values = [v for k, v in pairs if k.lower() != 'hash']
        expected = paynow_hash(values, self.integration_key)
        if not hmac.compare_digest(received.upper(), expected):
            raise GatewayError('Paynow message failed hash verification.')

    def initiate(self, payment, return_url, result_url, payer_email=''):
        fields = [('id', self.integration_id), ('reference', payment.reference), ('amount', f'{payment.amount:.2f}'),
                  ('additionalinfo', f'Rent/charges {payment.reference}'), ('returnurl', return_url),
                  ('resulturl', result_url), ('authemail', payer_email), ('status', 'Message')]
        fields.append(('hash', paynow_hash([v for _k, v in fields], self.integration_key)))
        pairs = parse_qsl(self._post(self.INITIATE_URL, fields), keep_blank_values=True)
        reply = dict(pairs)
        if reply.get('status', '').lower() != 'ok':
            raise GatewayError(f"Paynow refused the payment: {reply.get('error', 'unknown error')}")
        self._verify(pairs)
        return reply['browserurl'], reply['pollurl'], ''

    def parse_status(self, body: str) -> GatewayStatus:
        pairs = parse_qsl(body, keep_blank_values=True)
        self._verify(pairs)
        data = dict(pairs)
        return GatewayStatus(reference=data.get('reference', ''), status=_map_status(data.get('status')),
                             raw_status=data.get('status', ''), gateway_reference=data.get('paynowreference', ''),
                             amount=data.get('amount', ''))

    def poll(self, payment) -> GatewayStatus:
        if not payment.poll_url:
            raise GatewayError('No poll URL for this payment.')
        return self.parse_status(self._post(payment.poll_url, []))


class TestGateway:
    """In-app gateway for development and automated tests."""
    name = 'test'

    def __init__(self):
        if not getattr(settings, 'PAYMENT_TEST_GATEWAY_ENABLED', False):
            raise GatewayError('The test payment gateway is disabled.')

    def initiate(self, payment, return_url, result_url, payer_email=''):
        return f'{return_url}?simulate=1', '', f'TEST-{payment.reference}'

    def poll(self, payment) -> GatewayStatus:
        return GatewayStatus(reference=payment.reference, status='pending', raw_status='Created')


GATEWAYS = {'paynow': PaynowGateway, 'test': TestGateway}


def get_gateway(name=None):
    name = name or settings.PAYMENT_GATEWAY
    if name not in GATEWAYS:
        raise GatewayError(f'Unknown payment gateway {name!r}.')
    return GATEWAYS[name]()
