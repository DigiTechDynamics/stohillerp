"""
Edit/delete rules (utils/record_rules.py): transactions can be changed only as
drafts, posted ones are corrected by reversal/credit note; reference data in
use can't be deleted; every record carries edit_lock/delete_lock for the UI.
"""

from decimal import Decimal as D

import pytest

from apps.core.models import Currency
from apps.crm.models import Contact
from apps.finance.models import (
    ChartOfAccount, CustomerProfile, FiscalPeriod, Journal, JournalBatch, JournalEntry, Supplier, SupplierInvoice,
)
from apps.rentals.models import Lease
from tests.conftest import OPEN_PERIOD_DATE, _make_user
from tests.test_gap_closure_2 import _customer_invoice

pytestmark = pytest.mark.django_db


def _draft_entry(ref='JE-RULES-1'):
    period = FiscalPeriod.objects.get(start_date__lte=OPEN_PERIOD_DATE, end_date__gte=OPEN_PERIOD_DATE)
    return JournalEntry.objects.create(reference=ref, journal=Journal.objects.first(), fiscal_period=period,
                                       entry_date=OPEN_PERIOD_DATE, description='Draft for rules test')


def _message(response):
    return str(response.data['error']['message'])


def test_posted_journal_entry_cannot_be_deleted_but_a_draft_can(auth_client, superuser):
    client = auth_client(superuser)
    posted = JournalEntry.objects.filter(status='posted').first()
    response = client.delete(f'/api/v1/finance/entries/{posted.pk}/')
    assert response.status_code == 400 and 'Reverse' in _message(response)
    assert JournalEntry.objects.filter(pk=posted.pk).exists()

    draft = _draft_entry()
    assert client.delete(f'/api/v1/finance/entries/{draft.pk}/').status_code == 204
    assert not JournalEntry.objects.filter(pk=draft.pk).exists()


def test_records_report_their_locks(auth_client, superuser):
    client = auth_client(superuser)
    draft = _draft_entry('JE-RULES-2')
    posted = JournalEntry.objects.filter(status='posted').first()
    assert client.get(f'/api/v1/finance/entries/{draft.pk}/').data['delete_lock'] is None
    detail = client.get(f'/api/v1/finance/entries/{posted.pk}/').data
    assert detail['edit_lock'] and detail['delete_lock']
    rows = client.get('/api/v1/finance/entries/', {'page_size': 5}).data['results']
    assert all('edit_lock' in r and 'delete_lock' in r for r in rows)


def test_posted_customer_invoice_is_protected(auth_client, superuser):
    contact = Contact.objects.create(first_name='Rae', last_name='Rules', email='rae@test.local')
    customer = CustomerProfile.objects.create(contact_link=contact, name='Rae Rules',
                                              ar_account=ChartOfAccount.objects.get(code='1100'))
    invoice = _customer_invoice(customer, D('100'))
    client = auth_client(superuser)
    deleted = client.delete(f'/api/v1/finance/customer-invoices/{invoice.pk}/')
    assert deleted.status_code == 400 and 'credit note' in _message(deleted)
    edited = client.patch(f'/api/v1/finance/customer-invoices/{invoice.pk}/', {'notes': 'x'}, format='json')
    assert edited.status_code == 400


def test_active_lease_cannot_be_deleted_and_ended_lease_cannot_be_edited(auth_client, superuser):
    client = auth_client(superuser)
    lease = Lease.objects.filter(status='active').first()
    response = client.delete(f'/api/v1/rentals/leases/{lease.pk}/')
    assert response.status_code == 400 and 'Terminate' in _message(response)
    Lease.objects.filter(pk=lease.pk).update(status='terminated')
    assert client.patch(f'/api/v1/rentals/leases/{lease.pk}/', {'notes': 'x'}, format='json').status_code == 400


def test_reference_data_in_use_gives_a_clear_message(auth_client, superuser):
    supplier = Supplier.objects.create(name='Rules Supplies', ap_account=ChartOfAccount.objects.get(code='2010'))
    SupplierInvoice.objects.create(supplier=supplier, invoice_number='RULES-1', invoice_date=OPEN_PERIOD_DATE,
                                   due_date=OPEN_PERIOD_DATE, subtotal=D('10'), total_amount=D('10'))
    response = auth_client(superuser).delete(f'/api/v1/finance/suppliers/{supplier.pk}/')
    assert response.status_code == 400
    assert 'used by 1 supplier invoice' in _message(response)
    assert Supplier.objects.filter(pk=supplier.pk).exists()


def test_base_currency_cannot_be_deleted(auth_client, superuser):
    base = Currency.objects.get(is_base=True)
    response = auth_client(superuser).delete(f'/api/v1/core/currencies/{base.pk}/')
    assert response.status_code == 400 and 'base' in _message(response)


def test_users_are_deactivated_not_deleted(auth_client, superuser):
    other = _make_user('leaver@test.local')
    response = auth_client(superuser).delete(f'/api/v1/core/users/{other.pk}/')
    assert response.status_code == 400 and 'deactivated' in _message(response)


def test_draft_batch_is_deleted_with_its_draft_entries(auth_client, superuser):
    period = FiscalPeriod.objects.get(start_date__lte=OPEN_PERIOD_DATE, end_date__gte=OPEN_PERIOD_DATE)
    batch = JournalBatch.objects.create(batch_number='JB-RULES-1', description='Draft', fiscal_period=period,
                                        journal=Journal.objects.first(), maker=superuser)
    entry = _draft_entry('JE-RULES-BATCH')
    entry.batch = batch
    entry.save(update_fields=['batch'])
    response = auth_client(superuser).delete(f'/api/v1/finance/batches/{batch.pk}/')
    assert response.status_code == 204
    assert not JournalBatch.objects.filter(pk=batch.pk).exists()
    assert not JournalEntry.objects.filter(pk=entry.pk).exists()


def test_submitted_batch_cannot_be_deleted(auth_client, superuser):
    period = FiscalPeriod.objects.get(start_date__lte=OPEN_PERIOD_DATE, end_date__gte=OPEN_PERIOD_DATE)
    batch = JournalBatch.objects.create(batch_number='JB-RULES-2', description='Submitted', fiscal_period=period,
                                        journal=Journal.objects.first(), maker=superuser, status='pending_approval')
    response = auth_client(superuser).delete(f'/api/v1/finance/batches/{batch.pk}/')
    assert response.status_code == 400 and 'draft' in _message(response)