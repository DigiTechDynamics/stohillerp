"""
Regression tests for the UAT findings (uat-findings.md).

Notifications and the audit log have their own files (test_notifications_inbox.py,
test_audit_log.py).
"""

from decimal import Decimal as D
from io import BytesIO

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from apps.documents.models import Document, DocumentCategory
from apps.finance.models import BankAccount, ChartOfAccount, CustomerInvoice, PostingProfile
from apps.finance.services.accounting import AccountingError, receiving_bank_account, system_account_code
from apps.fixed_assets.models import AssetCategory, FixedAsset
from apps.payroll.models import PayrollSetting
from apps.payroll.services.zimbabwe import PayrollConfigError, ZimbabweTaxService
from tests.conftest import OPEN_PERIOD_DATE, _make_user
from tests.test_gap_closure import _sent_invoice, bank_account, lease_factory  # noqa: F401  (fixtures)

pytestmark = pytest.mark.django_db


# ─── #9-#11, HC-1, HC-2: documents ──────────────────────────────────────────

def test_document_upload_fills_reference_size_and_type(auth_client, superuser):
    category = DocumentCategory.objects.get(code='TITLE')
    upload = SimpleUploadedFile('deed.pdf', b'%PDF-1.4 test', content_type='application/pdf')
    response = auth_client(superuser).post('/api/v1/documents/', {
        'title': 'Deed', 'category': str(category.id), 'file': upload}, format='multipart')
    assert response.status_code == 201, response.data
    doc = Document.objects.get(pk=response.data['id'])
    assert doc.reference.startswith('DOC-') and doc.file_size == len(b'%PDF-1.4 test')
    assert doc.mime_type == 'application/pdf'


def test_document_types_are_seeded_with_live_counts(auth_client, superuser):
    category = DocumentCategory.objects.get(code='LEASE')
    Document.objects.create(title='Lease', category=category, file=SimpleUploadedFile('l.pdf', b'x'))
    rows = auth_client(superuser).get('/api/v1/documents/categories/').json()
    by_code = {r['code']: r for r in rows}
    assert {'TITLE', 'LEASE', 'KYC', 'SALE', 'FIN', 'GEN'} <= set(by_code)
    assert by_code['LEASE']['document_count'] == 1 and by_code['TITLE']['document_count'] == 0
    assert [r['code'] for r in rows][:2] == ['TITLE', 'LEASE']     # set order, not alphabetical


def test_confidential_documents_are_not_counted_for_other_modules(auth_client):
    category = DocumentCategory.objects.get(code='KYC')
    Document.objects.create(title='Secret', category=category, is_confidential=True,
                            file=SimpleUploadedFile('s.pdf', b'x'))
    agent = _make_user('agent.docs@test.local', role_type='agent')
    rows = auth_client(agent).get('/api/v1/documents/categories/').json()
    assert next(r for r in rows if r['code'] == 'KYC')['document_count'] == 0


# ─── #12: exports ────────────────────────────────────────────────────────────

@pytest.mark.parametrize('fmt,content_type,magic', [
    ('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', b'PK'),
    ('excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', b'PK'),
    ('pdf', 'application/pdf', b'%PDF'),
    ('csv', 'text/csv', b'\xef\xbb\xbf'),
])
def test_report_export_formats(auth_client, superuser, fmt, content_type, magic):
    response = auth_client(superuser).get('/api/v1/finance/reports/export/balance-sheet/', {'export_format': fmt})
    assert response.status_code == 200
    assert response['Content-Type'] == content_type and response.content.startswith(magic)


def test_excel_export_stores_numbers_as_numbers():
    from openpyxl import load_workbook

    from utils.exports import to_xlsx

    sheet = load_workbook(BytesIO(to_xlsx([['Report'], [], ['Code', 'Name', 'Amount'], ['4100', 'Rent', '1250.50']]))).active
    assert sheet['C4'].value == 1250.5


# ─── #13, #14: invoice and receipt PDFs ─────────────────────────────────────

def test_invoice_pdf_survives_markup_characters(auth_client, superuser, lease_factory):  # noqa: F811
    from apps.finance.services.pdf_service import generate_invoice_pdf

    lease = lease_factory()
    lease.tenant.first_name = 'Smith & <Sons>'
    lease.tenant.save()
    invoice = _sent_invoice(lease)
    from apps.rentals.services.finance_sync import RentalFinanceSyncService
    RentalFinanceSyncService.sync_rental_invoice_to_ar(invoice)
    ar = CustomerInvoice.objects.filter(invoice_number__startswith=f'AR-{invoice.invoice_number}').first()
    assert generate_invoice_pdf(ar).startswith(b'%PDF')
    response = auth_client(superuser).get(f'/api/v1/rentals/invoices/{invoice.id}/download_pdf/')
    assert response.status_code == 200 and response.content.startswith(b'%PDF')


def test_rental_invoice_list_export(auth_client, superuser, lease_factory):  # noqa: F811
    _sent_invoice(lease_factory())
    response = auth_client(superuser).get('/api/v1/rentals/invoices/export/', {'export_format': 'xlsx'})
    assert response.status_code == 200 and response.content.startswith(b'PK')


# ─── #15: fixed assets ───────────────────────────────────────────────────────

def test_asset_saves_with_its_depreciation_book(auth_client, superuser):
    category = AssetCategory.objects.get(code='IT')
    response = auth_client(superuser).post('/api/v1/fixed-assets/assets/', {
        'code': 'LAP-1', 'name': 'Laptop', 'category': str(category.id), 'acquisition_date': str(OPEN_PERIOD_DATE),
        'acquisition_cost': '1200', 'currency': '',
        'books': [{'book_type': 'Statutory', 'method': 'straight_line', 'useful_life_months': 36,
                   'salvage_value': '0', 'total_expected_units': '', 'current_nbv': '1200'}]}, format='json')
    assert response.status_code == 201, response.data
    book = FixedAsset.objects.get(code='LAP-1').books.get()
    assert book.useful_life_months == 36 and book.current_nbv == D('1200.00')


def test_asset_without_a_book_is_refused_with_a_reason(auth_client, superuser):
    category = AssetCategory.objects.get(code='IT')
    response = auth_client(superuser).post('/api/v1/fixed-assets/assets/', {
        'code': 'LAP-2', 'name': 'Laptop', 'category': str(category.id), 'acquisition_date': str(OPEN_PERIOD_DATE),
        'acquisition_cost': '1200'}, format='json')
    assert response.status_code == 400 and 'books' in str(response.data)


# ─── HC-8, HC-9: account codes from the posting profile ─────────────────────

def test_property_accounts_follow_the_posting_profile():
    profile = PostingProfile.objects.get(is_default=True)
    assert system_account_code('OWNER_FUNDS') == '2210'
    other = ChartOfAccount.objects.create(code='2215', name='Owner Trust 2', account_type='liability',
                                          account_sub_type='current_liability')
    profile.owner_funds = other
    profile.save()
    assert system_account_code('OWNER_FUNDS') == '2215'


def test_legacy_15_percent_vat_posting_is_gone():
    from apps.finance.services.accounting import AccountingService
    assert not hasattr(AccountingService, 'post_rental_invoice')


# ─── HC-10: receiving bank account ───────────────────────────────────────────

def test_payments_need_a_chosen_account_when_it_is_ambiguous(bank_account):  # noqa: F811
    second_gl = ChartOfAccount.objects.create(code='1031', name='Second bank', account_type='asset',
                                              account_sub_type='bank')
    second = BankAccount.objects.create(name='Second', bank_name='B', account_number='2', gl_account=second_gl)
    unbanked_gl = ChartOfAccount.objects.create(code='1032', name='No bank account', account_type='asset',
                                                account_sub_type='bank')

    PostingProfile.objects.update(bank_main=second_gl)
    assert receiving_bank_account() == second                 # the posting profile's main bank
    assert receiving_bank_account(bank_account) == bank_account  # the user's choice wins

    PostingProfile.objects.update(bank_main=unbanked_gl)
    with override_settings(RENTAL_PAYMENTS_BANK_ACCOUNT=''):
        with pytest.raises(AccountingError, match='Choose the bank account'):
            receiving_bank_account(setting='RENTAL_PAYMENTS_BANK_ACCOUNT')


# ─── HC-11, HC-12: currency and payroll settings ─────────────────────────────

def test_payroll_reports_missing_settings_instead_of_guessing():
    PayrollSetting.objects.filter(key='aids_levy_rate').delete()
    with pytest.raises(PayrollConfigError, match='aids_levy_rate'):
        ZimbabweTaxService.calculate_aids_levy(D('100'))


def test_paye_without_brackets_is_an_error():
    with pytest.raises(PayrollConfigError, match='No PAYE tax brackets'):
        ZimbabweTaxService.calculate_paye(D('1000'), 'XXX')


def test_postings_default_to_the_base_currency():
    from apps.finance.services.accounting import PostingData
    assert PostingData('x', OPEN_PERIOD_DATE).currency_code == ''   # resolved to the base currency when posted


# ─── HC-13, HC-14: defaults ──────────────────────────────────────────────────

@override_settings(COMPANY_CONFIG={'name': 'Stohill', 'currency': 'USD', 'country': 'ZW'})
def test_new_property_defaults_to_the_company_country():
    from apps.properties.models import Property, PropertyType
    prop = Property.objects.create(name='Avondale Flat', property_type=PropertyType.objects.first(),
                                   address_line1='1 King George Rd')
    assert prop.country == 'Zimbabwe'


def test_escalation_and_fee_defaults_are_settings(auth_client, superuser):
    client = auth_client(superuser)
    assert client.patch('/api/v1/propman/defaults/', {'rent_escalation_rate': '6.5'}, format='json').status_code == 200
    assert client.get('/api/v1/propman/defaults/').json()['rent_escalation_rate']['value'] == '6.50'
    from apps.rentals.models import default_escalation_rate
    assert default_escalation_rate() == D('6.50')
    assert client.patch('/api/v1/propman/defaults/', {'rent_escalation_rate': '150'}, format='json').status_code == 400


# ─── GAP-12, GAP-15: reversal and SoD suggestions ────────────────────────────

def test_sod_suggestions_skip_pairs_already_covered(auth_client, superuser):
    client = auth_client(superuser)
    suggestions = client.get('/api/v1/core/sod-rules/suggestions/').json()
    assert any(s['name'] == 'Create payables vs. release payments' for s in suggestions)
    first = suggestions[0]
    client.post('/api/v1/core/sod-rules/', {k: first[k] for k in ('name', 'module_a', 'module_b', 'severity', 'description')},
                format='json')
    assert first['name'] not in [s['name'] for s in client.get('/api/v1/core/sod-rules/suggestions/').json()]


# ─── GAP-9, GAP-10: attendance and leave balances ───────────────────────────

def test_attendance_hours_and_leave_balance(auth_client, superuser):
    from apps.hr.models import Employee, LeaveRequest

    client = auth_client(superuser)
    employee = Employee.objects.first()
    response = client.post('/api/v1/hr/attendance/', {'employee': str(employee.id), 'check_in': '2025-07-01T08:00:00Z',
                                                      'check_out': '2025-07-01T16:30:00Z'}, format='json')
    assert response.status_code == 201 and response.json()['worked_hours'] == '8.50'
    bad = client.post('/api/v1/hr/attendance/', {'employee': str(employee.id), 'check_in': '2025-07-01T08:00:00Z',
                                                 'check_out': '2025-07-01T07:00:00Z'}, format='json')
    assert bad.status_code == 400

    allocation = client.post('/api/v1/hr/allocations/', {'employee': str(employee.id), 'leave_type': 'annual',
                                                         'days_allocated': '20', 'valid_from': '2025-01-01',
                                                         'valid_to': '2025-12-31'}, format='json').json()
    LeaveRequest.objects.create(employee=employee, leave_type='annual', start_date='2025-03-01',
                                end_date='2025-03-03', days_requested=D('3'), status='approved')
    row = client.get(f"/api/v1/hr/allocations/{allocation['id']}/").json()
    assert D(str(row['days_taken'])) == D('3') and D(str(row['days_remaining'])) == D('17')


# ─── GAP-18 to GAP-21: integrations ──────────────────────────────────────────

def test_integration_status_and_test_email(auth_client, superuser):
    from django.core import mail

    client = auth_client(superuser)
    keys = {i['key'] for i in client.get('/api/v1/core/integrations/').json()}
    assert {'email', 'sms', 'payments', 'credit_checks', 'esignature', 'cpi'} <= keys
    response = client.post('/api/v1/core/integrations/test-email/', {'to': 'ops@test.local'}, format='json')
    assert response.json()['status'] == 'sent' and mail.outbox[-1].to == ['ops@test.local']
    agent = _make_user('agent.int@test.local', role_type='agent')
    assert auth_client(agent).get('/api/v1/core/integrations/').status_code == 403


@override_settings(SMS_BACKEND='apps.notifications.services.HTTPSMSBackend', SMS_HTTP_URL='')
def test_misconfigured_sms_gateway_is_recorded_not_raised():
    from apps.notifications.services import send_sms
    message = send_sms('+263771234567', 'Hello')
    assert message.status == 'failed' and 'SMS_HTTP_URL' in message.error


# ─── GAP-5: contact KYC documents ───────────────────────────────────────────

def test_contact_documents_upload_and_verify(auth_client, superuser):
    from apps.crm.models import Contact
    contact = Contact.objects.first()
    client = auth_client(superuser)
    response = client.post('/api/v1/crm/contact-documents/', {
        'contact': str(contact.id), 'name': 'ID copy', 'document_type': 'id',
        'file': SimpleUploadedFile('id.pdf', b'%PDF', content_type='application/pdf')}, format='multipart')
    assert response.status_code == 201, response.data
    assert client.post(f"/api/v1/crm/contact-documents/{response.data['id']}/verify/").status_code == 200
    listing = client.get('/api/v1/crm/contact-documents/', {'contact': str(contact.id)}).json()
    assert listing['results'][0]['is_verified'] is True
