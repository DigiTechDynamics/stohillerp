"""Tenant portal: invitation/activation, access fence, own-data only, online payments."""

import re
from datetime import timedelta
from decimal import Decimal as D
from io import BytesIO
from unittest import mock
from urllib.parse import urlencode

import pytest
from rest_framework.test import APIClient

from apps.core.models import User
from apps.crm.models import Contact
from apps.finance.models import BankAccount, ChartOfAccount, CustomerInvoice, CustomerInvoiceLine
from apps.finance.services.accounting import AccountingService
from apps.portal.gateways import PaynowGateway, paynow_hash
from apps.portal.models import OnlinePayment
from apps.portal.services import invite
from apps.properties.models import Property, PropertyType
from apps.rentals.models import Lease, RentalInvoice
from tests.conftest import OPEN_PERIOD_DATE

pytestmark = pytest.mark.django_db

D0 = OPEN_PERIOD_DATE


@pytest.fixture(autouse=True)
def bank(db):
    gl = ChartOfAccount.objects.get(code='1010')
    account, _ = BankAccount.objects.get_or_create(
        gl_account=gl, defaults={'name': 'Main', 'bank_name': 'Test Bank', 'account_number': '000111'})
    return account


def _tenant(n, mailoutbox=None):
    contact = Contact.objects.create(first_name='Tess', last_name=f'Tenant{n}', email=f'tess{n}@test.local',
                                     contact_type='tenant')
    prop = Property.objects.create(name=f'Flat {n}', property_type=PropertyType.objects.first(),
                                   address_line1=f'{n} Portal Road')
    lease = Lease.objects.create(property=prop, tenant=contact, status='active', start_date=D0.replace(day=1),
                                 monthly_rental=D('700'), rental_escalation_rate=D('0'))
    user = invite(contact)
    return contact, lease, User.objects.get(pk=user.pk)


def _client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def _rent_invoice(lease):
    return RentalInvoice.objects.create(lease=lease, period_start=D0.replace(day=1), period_end=D0.replace(day=28),
                                        due_date=D0, status='sent', rental_amount=D('700'), total_amount=D('700'),
                                        balance_due=D('700'))


def test_invite_and_activate(auth_client, superuser, mailoutbox):
    contact = Contact.objects.create(first_name='Ivy', last_name='Invitee', email='ivy@test.local')
    response = auth_client(superuser).post(f'/api/v1/crm/contacts/{contact.id}/invite_to_portal/')
    assert response.status_code == 200 and 'activation_link' not in response.data
    link = re.search(r'uid=(\S+)&token=(\S+)', mailoutbox[-1].body)
    anonymous = APIClient()
    response = anonymous.post('/api/v1/auth/portal-activate/',
                              {'uid': link[1], 'token': link[2], 'password': 'Tenant-passw0rd!'})
    assert response.status_code == 200, response.data
    # One use only.
    assert anonymous.post('/api/v1/auth/portal-activate/', {'uid': link[1], 'token': link[2],
                                                             'password': 'Another-passw0rd!'}).status_code == 400
    login = anonymous.post('/api/v1/auth/login/', {'email': 'ivy@test.local', 'password': 'Tenant-passw0rd!'})
    assert login.status_code == 200 and 'access' in login.data


def test_staff_email_cannot_become_a_portal_login(superuser):
    from apps.finance.services.accounting import AccountingError
    contact = Contact.objects.create(first_name='S', last_name='Staff', email=superuser.email)
    with pytest.raises(AccountingError):
        invite(contact)


def test_tenant_is_fenced_into_the_portal():
    _contact, lease, user = _tenant(1)
    client = _client(user)
    me = client.get('/api/v1/portal/me/')
    assert me.status_code == 200 and me.data['leases'][0]['lease_number'] == lease.lease_number
    for url in ('/api/v1/dashboard/executive/', '/api/v1/crm/contacts/', '/api/v1/rentals/leases/',
                '/api/v1/finance/customer-invoices/', '/api/v1/core/users/'):
        assert client.get(url).status_code == 403, url
    assert client.get('/api/v1/core/me/').data['accessible_modules'] == ['portal']


def test_staff_without_contact_get_403_on_portal(auth_client, superuser):
    assert auth_client(superuser).get('/api/v1/portal/me/').status_code == 403


def test_tenants_only_see_their_own_records():
    _c1, lease1, user1 = _tenant(2)
    _c2, lease2, user2 = _tenant(3)
    invoice2 = _rent_invoice(lease2)
    ar2 = CustomerInvoice.objects.get(invoice_number=f'AR-{invoice2.invoice_number}')
    client1 = _client(user1)
    assert client1.get('/api/v1/portal/invoices/').data == []
    assert client1.get(f'/api/v1/portal/invoices/{ar2.id}/pdf/').status_code == 404
    assert client1.post('/api/v1/portal/payments/', {'invoices': [str(ar2.id)]}, format='json').status_code == 400
    assert client1.post('/api/v1/portal/maintenance/', {'lease': str(lease2.id), 'category': 'x',
                                                        'description': 'y'}).status_code == 404
    pdf = _client(user2).get(f'/api/v1/portal/invoices/{ar2.id}/pdf/')
    assert pdf.status_code == 200 and pdf.content.startswith(b'%PDF')


def test_tenant_logs_maintenance_and_sees_statement():
    _c, lease, user = _tenant(4)
    _rent_invoice(lease)
    client = _client(user)
    response = client.post('/api/v1/portal/maintenance/', {'lease': str(lease.id), 'category': 'Plumbing',
                                                           'description': 'Leaking tap', 'priority': 'high'})
    assert response.status_code == 201 and response.data['reference'].startswith('MNT-')
    assert client.get('/api/v1/portal/maintenance/').data[0]['priority'] == 'high'
    statement = client.get('/api/v1/portal/statement/', {'from_date': D0.replace(day=1),
                                                         'to_date': D0.replace(day=28)}).data
    assert D(statement['closing_balance']) == D('700.00')


def test_online_rent_payment_settles_rental_and_ar_once():
    _c, lease, user = _tenant(5)
    invoice = _rent_invoice(lease)
    client = _client(user)
    payable = [row for row in client.get('/api/v1/portal/invoices/').data if row['payable']]
    assert len(payable) == 1
    response = client.post('/api/v1/portal/payments/', {'invoices': [payable[0]['id']]}, format='json')
    assert response.status_code == 201, response.data
    reference = response.data['reference']
    assert response.data['redirect_url'].endswith(f'/portal/payments/{reference}?simulate=1')

    paid = client.post(f'/api/v1/portal/payments/{reference}/simulate/', {'outcome': 'paid'})
    assert paid.status_code == 200 and paid.data['status'] == 'paid'
    client.post(f'/api/v1/portal/payments/{reference}/simulate/', {'outcome': 'paid'})   # replayed
    invoice.refresh_from_db()
    assert invoice.status == 'paid' and invoice.amount_paid == D('700.00') and invoice.payments.count() == 1
    assert CustomerInvoice.objects.get(invoice_number=f'AR-{invoice.invoice_number}').status == 'paid'
    assert client.get('/api/v1/portal/me/').data['balance'] == '0.00'


def test_online_payment_of_non_rent_invoice_is_receipted_in_ar():
    contact, _lease, user = _tenant(6)
    from apps.portal.services import customer_for
    recharge = CustomerInvoice.objects.create(customer=customer_for(contact), invoice_date=D0,
                                              due_date=D0 + timedelta(days=7), subtotal=D('80'), total_amount=D('80'))
    CustomerInvoiceLine.objects.create(invoice=recharge, description='Window repair', unit_price=D('80'),
                                       line_total=D('80'), revenue_account=ChartOfAccount.objects.get(code='4920'))
    entry = AccountingService().post_customer_invoice(recharge)
    recharge.status, recharge.journal_entry = 'posted', entry
    recharge.save()
    client = _client(user)
    reference = client.post('/api/v1/portal/payments/', {'invoices': [str(recharge.id)]},
                            format='json').data['reference']
    client.post(f'/api/v1/portal/payments/{reference}/simulate/', {'outcome': 'paid'})
    recharge.refresh_from_db()
    assert recharge.status == 'paid' and recharge.allocations.get().receipt.receipt_reference.startswith('TEST-')


def test_simulation_refused_when_test_gateway_disabled(settings):
    _c, lease, user = _tenant(7)
    _rent_invoice(lease)
    client = _client(user)
    invoice_id = next(r['id'] for r in client.get('/api/v1/portal/invoices/').data if r['payable'])
    reference = client.post('/api/v1/portal/payments/', {'invoices': [invoice_id]}, format='json').data['reference']
    settings.PAYMENT_TEST_GATEWAY_ENABLED = False
    assert client.post(f'/api/v1/portal/payments/{reference}/simulate/', {'outcome': 'paid'}).status_code == 403


# ─── Paynow protocol ─────────────────────────────────────────────────────────

@pytest.fixture
def paynow(settings):
    settings.PAYNOW_INTEGRATION_ID = '1234'
    settings.PAYNOW_INTEGRATION_KEY = 'secret-key'
    return PaynowGateway()


def _signed(fields, key='secret-key'):
    return urlencode(fields + [('hash', paynow_hash([v for _k, v in fields], key))])


def test_paynow_initiate_sends_signed_request_and_verifies_reply(paynow):
    payment = OnlinePayment(reference='OP1', amount=D('10.50'))
    reply = _signed([('status', 'Ok'), ('browserurl', 'https://paynow.test/pay/1'),
                     ('pollurl', 'https://paynow.test/poll/1')])
    with mock.patch('apps.portal.gateways.urlopen') as urlopen:
        urlopen.return_value.__enter__.return_value = BytesIO(reply.encode())
        redirect, poll, _ref = paynow.initiate(payment, 'https://app/return', 'https://app/result', 'a@b.c')
    sent = dict(re.findall(r'([^&=]+)=([^&]*)', urlopen.call_args[0][0].data.decode()))
    assert sent['id'] == '1234' and sent['amount'] == '10.50' and len(sent['hash']) == 128
    assert (redirect, poll) == ('https://paynow.test/pay/1', 'https://paynow.test/poll/1')


def test_paynow_callback_requires_valid_hash_and_receipts_payment(paynow):
    _c, lease, user = _tenant(8)
    _rent_invoice(lease)
    client = _client(user)
    invoice_id = next(r['id'] for r in client.get('/api/v1/portal/invoices/').data if r['payable'])
    payment = OnlinePayment.objects.get(reference=client.post(
        '/api/v1/portal/payments/', {'invoices': [invoice_id]}, format='json').data['reference'])
    OnlinePayment.objects.filter(pk=payment.pk).update(gateway='paynow')

    fields = [('reference', payment.reference), ('amount', '700.00'), ('paynowreference', 'PN-99'),
              ('pollurl', 'https://paynow.test/poll/1'), ('status', 'Paid')]
    anonymous = APIClient()
    forged = anonymous.post('/api/v1/payments/paynow/result/', _signed(fields, key='wrong'),
                            content_type='application/x-www-form-urlencoded')
    assert forged.status_code == 400
    ok = anonymous.post('/api/v1/payments/paynow/result/', _signed(fields),
                        content_type='application/x-www-form-urlencoded')
    assert ok.status_code == 200
    payment.refresh_from_db()
    assert payment.status == 'paid' and payment.gateway_reference == 'PN-99' and payment.receipted
