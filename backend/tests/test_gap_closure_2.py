"""
Second gap-closure pass: private documents, sensitive-field trimming, strict
sub-ledger syncs, validated CSV import, memo asset books, scheduled jobs,
AR/AP settlement (allocations, credit notes, write-offs, refunds), foreign
currency (realised and unrealised differences), cost-centre dimensions,
recurring/reversing journals, cash-flow statement and statements of account.
"""

from datetime import date, timedelta
from decimal import Decimal as D
from io import StringIO

import pytest
from dateutil.relativedelta import relativedelta
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db.models import Q, Sum
from django.utils import timezone

from apps.core.models import Currency
from apps.crm.models import Contact
from apps.finance.models import (
    ARAllocation, BankAccount, ChartOfAccount, CostCenter, CustomerInvoice, CustomerInvoiceLine, CustomerProfile,
    CustomerReceipt, ExchangeRate, JournalEntry, JournalLine, Supplier, SupplierInvoice, SupplierInvoiceLine,
    SupplierPayment, TaxTransaction,
)
from apps.finance.services.accounting import AccountingError, AccountingService, PostingData
from apps.finance.services.settlement import SettlementService
from tests.conftest import OPEN_PERIOD_DATE, _make_user

pytestmark = pytest.mark.django_db

D0 = OPEN_PERIOD_DATE           # 2025-06-15, open period
TODAY = timezone.localdate()


# ─── helpers ─────────────────────────────────────────────────────────────────

def _net(code, **entry_filters):
    agg = JournalLine.objects.filter(
        account__code=code, entry__status__in=JournalEntry.LEDGER_STATUSES,
        **{f'entry__{k}': v for k, v in entry_filters.items()},
    ).aggregate(dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
    return (agg['dr'] or D('0')) - (agg['cr'] or D('0'))


def _balanced(entry):
    return entry.get_total_debits() == entry.get_total_credits() > 0


@pytest.fixture
def bank(db):
    gl = ChartOfAccount.objects.get(code='1010')
    account, _ = BankAccount.objects.get_or_create(
        gl_account=gl, defaults={'name': 'Main', 'bank_name': 'Test Bank', 'account_number': '000111'})
    return account


@pytest.fixture
def customer(db):
    contact = Contact.objects.create(first_name='Cara', last_name='Customer', email='cara@test.local',
                                     contact_type='buyer', id_number='63-123456-A-12')
    return CustomerProfile.objects.create(contact_link=contact, name='Cara Customer',
                                          ar_account=ChartOfAccount.objects.get(code='1100'))


@pytest.fixture
def supplier(db):
    return Supplier.objects.create(name='Pipe Fixers', ap_account=ChartOfAccount.objects.get(code='2010'))


@pytest.fixture
def zwg(db):
    currency = Currency.objects.get(code='ZWG')
    ExchangeRate.objects.update_or_create(currency=currency, effective_date=D0 - timedelta(days=30),
                                          defaults={'rate': D('0.0400000000')})
    ExchangeRate.objects.update_or_create(currency=currency, effective_date=D0 + timedelta(days=5),
                                          defaults={'rate': D('0.0500000000')})
    return currency


def _customer_invoice(customer, amount, on=D0, currency=None, credit_note=False, vat=D('0')):
    inv = CustomerInvoice.objects.create(
        customer=customer, invoice_date=on, due_date=on + timedelta(days=30), currency=currency,
        subtotal=amount, tax_total=vat, total_amount=amount + vat,
        document_type='credit_note' if credit_note else 'invoice')
    CustomerInvoiceLine.objects.create(invoice=inv, description='Service', unit_price=amount, tax_amount=vat,
                                       line_total=amount + vat, revenue_account=ChartOfAccount.objects.get(code='4300'))
    entry = AccountingService().post_customer_invoice(inv)
    inv.status, inv.journal_entry = 'posted', entry
    inv.save(update_fields=['status', 'journal_entry'])
    return inv


def _supplier_invoice(supplier, amount, on=D0, currency=None, credit_note=False):
    inv = SupplierInvoice.objects.create(
        supplier=supplier, invoice_date=on, due_date=on + timedelta(days=30), currency=currency,
        subtotal=amount, total_amount=amount, document_type='credit_note' if credit_note else 'invoice')
    SupplierInvoiceLine.objects.create(invoice=inv, description='Repairs', unit_price=amount, line_total=amount,
                                       expense_account=ChartOfAccount.objects.get(code='5300'))
    entry = AccountingService().post_supplier_invoice(inv)
    inv.status, inv.journal_entry = 'posted', entry
    inv.save(update_fields=['status', 'journal_entry'])
    return inv


def _receipt(customer, bank, amount, on=D0, currency=None, **kwargs):
    rec = CustomerReceipt.objects.create(customer=customer, receipt_date=on, amount=amount, bank_account=bank,
                                         currency=currency)
    entry = AccountingService().post_customer_receipt(rec, **kwargs)
    rec.status, rec.journal_entry = 'posted', entry
    rec.save(update_fields=['status', 'journal_entry'])
    rec.refresh_from_db()
    return rec


# ─── P0: private documents and sensitive fields ──────────────────────────────

def test_documents_are_downloaded_through_the_api(auth_client, superuser):
    from apps.documents.models import DocumentCategory

    category, _ = DocumentCategory.objects.get_or_create(code='KYC', defaults={'name': 'KYC'})
    client = auth_client(superuser)
    upload = SimpleUploadedFile('passport.pdf', b'%PDF-1.4 secret', content_type='application/pdf')
    response = client.post('/api/v1/documents/', {'title': 'Passport', 'reference': 'DOC-1',
                                                  'category': category.id, 'file': upload}, format='multipart')
    assert response.status_code == 201, response.data
    assert 'file' not in response.data  # no public /media/ URL leaks
    download = client.get(response.data['download_url'])
    assert download.status_code == 200
    assert b''.join(download.streaming_content) == b'%PDF-1.4 secret'
    assert download['Cache-Control'] == 'private, no-store'


def test_confidential_documents_need_documents_module(auth_client, superuser):
    from apps.documents.models import Document, DocumentCategory

    category, _ = DocumentCategory.objects.get_or_create(code='HR', defaults={'name': 'HR'})
    doc = Document.objects.create(title='Payslip', reference='DOC-2', category=category, is_confidential=True,
                                  file=SimpleUploadedFile('p.pdf', b'x'), created_by=superuser)
    rental = _make_user('rm@test.local', role_type='rental_manager')   # has the documents module
    agent = _make_user('ag@test.local', role_type='agent')             # reads documents only via properties
    assert auth_client(rental).get(f'/api/v1/documents/{doc.id}/download/').status_code == 200
    # Confidential documents are not even listed for other modules.
    assert auth_client(agent).get(f'/api/v1/documents/{doc.id}/download/').status_code == 404
    assert auth_client(agent).get('/api/v1/documents/').data['count'] == 0


def test_production_hands_private_files_to_nginx(settings, superuser, auth_client):
    from apps.crm.models import ContactDocument

    settings.PRIVATE_MEDIA_ACCEL_PREFIX = '/protected-media/'
    contact = Contact.objects.create(first_name='K', last_name='Y', email='ky@test.local')
    doc = ContactDocument.objects.create(contact=contact, name='ID', document_type='id',
                                         file=SimpleUploadedFile('id.png', b'img'))
    response = auth_client(superuser).get(f'/api/v1/crm/contact-documents/{doc.id}/download/')
    assert response.status_code == 200
    assert response['X-Accel-Redirect'].startswith('/protected-media/crm/documents/')


def test_kyc_fields_hidden_from_lookup_only_modules(auth_client, customer):
    contact = customer.contact_link
    accountant = _make_user('acc2@test.local', role_type='accountant')
    rental = _make_user('rm3@test.local', role_type='rental_manager')
    assert 'id_number' not in auth_client(accountant).get(f'/api/v1/crm/contacts/{contact.id}/').data
    assert auth_client(rental).get(f'/api/v1/crm/contacts/{contact.id}/').data['id_number'] == '63-123456-A-12'


def test_employee_personal_fields_hidden_from_agents(auth_client):
    from apps.hr.models import Employee

    employee = Employee.objects.first()
    agent = _make_user('ag2@test.local', role_type='agent')
    hr = _make_user('hr2@test.local', role_type='hr_manager')
    assert 'id_number' not in auth_client(agent).get(f'/api/v1/hr/employees/{employee.id}/').data
    assert 'id_number' in auth_client(hr).get(f'/api/v1/hr/employees/{employee.id}/').data


# ─── P0: strict syncs and import ─────────────────────────────────────────────

def test_failed_rental_sync_is_not_silently_saved(db):
    from apps.properties.models import Property, PropertyType
    from apps.rentals.models import Lease, RentalInvoice

    tenant = Contact.objects.create(first_name='T', last_name='S', email='ts@test.local', contact_type='tenant')
    prop = Property.objects.create(name='P', property_type=PropertyType.objects.first(), address_line1='x')
    lease = Lease.objects.create(property=prop, tenant=tenant, start_date=D0, monthly_rental=D('500'))
    before = RentalInvoice.objects.count()
    with pytest.raises(AccountingError, match='does not equal'):
        RentalInvoice.objects.create(lease=lease, period_start=D0, period_end=D0, due_date=D0, status='sent',
                                     rental_amount=D('500'), total_amount=D('999'), balance_due=D('999'))
    assert RentalInvoice.objects.count() == before


def test_import_is_validated_and_all_or_nothing(auth_client, superuser):
    client = auth_client(superuser)
    bad = 'code,name,account_type,account_sub_type\n5931,Security,expense,operating_expense\n5932,Oops,notatype,x\n'
    response = client.post('/api/v1/core/data/import/coa/', {'file': SimpleUploadedFile('c.csv', bad.encode())},
                           format='multipart')
    assert response.status_code == 400
    assert response.data['row_errors'][0]['row'] == 3
    assert not ChartOfAccount.objects.filter(code='5931').exists()

    good = 'code,name,account_type,account_sub_type\n5931,Security,expense,operating_expense\n'
    upload = lambda: SimpleUploadedFile('c.csv', good.encode())  # noqa: E731
    assert client.post('/api/v1/core/data/import/coa/', {'file': upload()}, format='multipart').status_code == 201
    again = client.post('/api/v1/core/data/import/coa/', {'file': upload()}, format='multipart')
    assert again.data['skipped'] == 1 and again.data['created'] == 0


def test_customer_import_creates_contact_and_ar_profile(auth_client, superuser):
    """The 'customers' import pointed at a model that didn't exist."""
    csv = 'first_name,last_name,email,phone,tax_number,payment_terms_days\nNo,Mo,nomo@test.local,,,14\n'
    response = auth_client(superuser).post('/api/v1/core/data/import/customers/',
                                           {'file': SimpleUploadedFile('c.csv', csv.encode())}, format='multipart')
    assert response.status_code == 201, response.data
    assert CustomerProfile.objects.get(contact_link__email='nomo@test.local').payment_terms_days == 14


def test_every_template_has_a_sample_row(auth_client, superuser):
    from apps.core.data_management import SPECS

    for module in SPECS:
        response = auth_client(superuser).get(f'/api/v1/core/data/template/{module}/')
        assert response.status_code == 200
        assert len(response.content.decode().strip().splitlines()) == 2


# ─── P0: memo asset books and scheduled jobs ─────────────────────────────────

def test_tax_book_does_not_post_to_gl(superuser):
    from apps.fixed_assets.models import AssetBook, AssetCategory, FixedAsset
    from apps.fixed_assets.services.depreciation import DepreciationService

    acct = {c: ChartOfAccount.objects.get(code=c) for c in ('1520', '1590', '5700', '4900')}
    category = AssetCategory.objects.create(code='IT-T', name='IT', asset_cost_account=acct['1520'],
                                            accum_depr_account=acct['1590'], depr_expense_account=acct['5700'],
                                            disposal_gain_loss_account=acct['4900'])
    asset = FixedAsset.objects.create(code='FA-T1', name='Laptop', category=category,
                                      acquisition_date=D0.replace(day=1), acquisition_cost=D('1200'))
    for book_type, posts in (('Statutory', True), ('Tax', False)):
        AssetBook.objects.create(asset=asset, book_type=book_type, method='straight_line', useful_life_months=12,
                                 current_nbv=D('1200'), posts_to_gl=posts)
    results = DepreciationService(superuser).run_depreciation_for_period(
        asset_ids=[asset.id], end_date=D0.replace(day=1) + relativedelta(months=1) - timedelta(days=1))
    assert len(results) == 2
    assert JournalEntry.objects.filter(source_module='fixed_assets',
                                       source_id__in=asset.books.values('id')).count() == 1


def test_daily_jobs_run(db):
    out = StringIO()
    call_command('run_daily_jobs', stdout=out)
    assert 'Recurring and reversing journals: ok' in out.getvalue()


def test_scheduler_waits_until_next_run():
    from datetime import datetime

    from apps.core.management.commands.run_scheduler import seconds_until

    now = timezone.make_aware(datetime(2026, 1, 1, 3, 0))
    assert seconds_until(2, 0, now) == 23 * 3600
    assert seconds_until(4, 30, now) == 1.5 * 3600


# ─── AR/AP settlement ────────────────────────────────────────────────────────

def test_supplier_payment_settles_invoices(supplier, bank):
    """Posting a payment used to leave every AP invoice 'unpaid' forever."""
    first = _supplier_invoice(supplier, D('300'))
    second = _supplier_invoice(supplier, D('200'), on=D0 + timedelta(days=1))
    payment = SupplierPayment.objects.create(supplier=supplier, payment_date=D0, amount=D('400'), bank_account=bank)
    AccountingService().post_supplier_payment(payment)
    first.refresh_from_db()
    second.refresh_from_db()
    payment.refresh_from_db()
    assert first.status == 'paid' and second.amount_paid == D('100') and second.status == 'partial'
    assert payment.unapplied_amount == 0
    assert payment.allocations.count() == 2


def test_receipt_explicit_allocation_leaves_credit_on_account(customer, bank):
    old = _customer_invoice(customer, D('100'))
    new = _customer_invoice(customer, D('250'))
    receipt = _receipt(customer, bank, D('300'), allocations=[(new, D('250'))])
    old.refresh_from_db()
    new.refresh_from_db()
    assert new.status == 'paid' and old.amount_paid == 0     # not FIFO: the customer chose the invoice
    assert receipt.unapplied_amount == D('50')

    SettlementService().allocate_receipt(receipt, [(old, D('50'))])
    old.refresh_from_db()
    receipt.refresh_from_db()
    assert old.amount_paid == D('50') and receipt.unapplied_amount == 0


def test_over_allocation_is_refused(customer, bank):
    inv = _customer_invoice(customer, D('100'))
    receipt = _receipt(customer, bank, D('80'), allocate=False)
    with pytest.raises(AccountingError, match='exceed'):
        SettlementService().allocate_receipt(receipt, [(inv, D('90'))])


def test_refund_of_unapplied_cash(customer, bank):
    receipt = _receipt(customer, bank, D('120'), allocate=False)
    bank_before = _net('1010')
    row = SettlementService().refund(receipt, D('120'), bank, D0)
    receipt.refresh_from_db()
    assert receipt.unapplied_amount == 0 and _balanced(row.journal_entry)
    assert _net('1010') - bank_before == D('-120')


def test_credit_note_reverses_revenue_and_vat_and_applies(customer, bank):
    inv = _customer_invoice(customer, D('1000'), vat=D('155'))
    note = _customer_invoice(customer, D('200'), vat=D('31'), credit_note=True)
    assert note.invoice_number.startswith('SCN-')
    assert note.journal_entry.lines.filter(account__code='4300', side='debit', amount=D('200')).exists()
    assert note.journal_entry.lines.filter(account__code='1100', side='credit', amount=D('231')).exists()
    assert TaxTransaction.objects.get(journal_entry=note.journal_entry).tax_amount == D('-31')

    SettlementService().apply_credit_note(note, [(inv, D('231'))])
    inv.refresh_from_db()
    note.refresh_from_db()
    assert inv.balance_due == D('924') and note.status == 'paid'


def test_write_off_to_bad_debts(customer):
    inv = _customer_invoice(customer, D('75'))
    bad_debts_before = _net('5940')
    SettlementService().write_off(inv, reason='Tenant absconded')
    inv.refresh_from_db()
    assert inv.status == 'paid' and inv.balance_due == 0
    assert _net('5940') - bad_debts_before == D('75')


def test_settlement_endpoints(auth_client, superuser, customer, bank):
    client = auth_client(superuser)
    inv = _customer_invoice(customer, D('90'))
    receipt = _receipt(customer, bank, D('90'), allocate=False)
    response = client.post(f'/api/v1/finance/customer-receipts/{receipt.id}/allocate/',
                           {'allocations': [{'invoice': str(inv.id), 'amount': '90'}]}, format='json')
    assert response.status_code == 200, response.data
    assert response.data['unapplied_amount'] == '0.00'
    history = client.get('/api/v1/finance/ar-allocations/', {'invoice': inv.id}).data
    assert history['count'] == 1 and history['results'][0]['receipt_reference'] == receipt.receipt_reference

    inv2 = _customer_invoice(customer, D('10'))
    response = client.post(f'/api/v1/finance/customer-invoices/{inv2.id}/write_off/', {'reason': 'small'})
    assert response.status_code == 200 and response.data['status'] == 'paid'
    # Business-rule errors surface as 400 with a message, not 500.
    response = client.post(f'/api/v1/finance/customer-invoices/{inv2.id}/write_off/', {})
    assert response.status_code == 400


def test_aging_shows_unapplied_credits(auth_client, superuser, customer, bank):
    _customer_invoice(customer, D('100'))
    _receipt(customer, bank, D('30'), allocate=False)
    data = auth_client(superuser).get('/api/v1/finance/reports/ar-aging/', {'as_at_date': D0}).data
    row = next(r for r in data['rows'] if r['id'] == str(customer.id))
    assert D(row['unapplied']) == D('-30') and D(row['total']) == D('70')


# ─── foreign currency ────────────────────────────────────────────────────────

def test_foreign_invoice_posts_at_document_rate(customer, zwg):
    inv = _customer_invoice(customer, D('10000'), currency=zwg)          # rate 0.04 on D0
    assert inv.exchange_rate == D('0.04')
    line = inv.journal_entry.lines.get(account__code='1100')
    assert line.amount_currency == D('10000') and line.amount == D('400.00')


def test_realised_exchange_gain_on_settlement(customer, bank, zwg):
    inv = _customer_invoice(customer, D('10000'), currency=zwg)          # booked 400.00
    gain_before = _net('4950')
    receipt = _receipt(customer, bank, D('10000'), on=D0 + timedelta(days=6), currency=zwg,
                       allocations=[(inv, D('10000'))])                  # received 500.00
    alloc = ARAllocation.objects.get(receipt=receipt)
    assert alloc.fx_difference == D('100.00') and _balanced(alloc.journal_entry)
    assert _net('4950') - gain_before == D('-100.00')                    # credit = gain
    # AR for this customer is fully cleared in base currency too.
    assert customer.balance == 0


def test_mismatched_currency_allocation_refused(customer, bank, zwg):
    inv = _customer_invoice(customer, D('100'))
    receipt = _receipt(customer, bank, D('1000'), currency=zwg, allocate=False)
    with pytest.raises(AccountingError, match='different currency'):
        SettlementService().allocate_receipt(receipt, [(inv, D('100'))])


def test_unrealised_revaluation_reverses_next_day(auth_client, superuser, customer, zwg):
    from apps.finance.services.recurring import process_auto_reversals

    _customer_invoice(customer, D('10000'), currency=zwg)                # booked 400.00 at 0.04
    as_of = D0 + timedelta(days=10)                                      # rate 0.05 -> 500.00
    response = auth_client(superuser).post('/api/v1/finance/fx/revalue/', {'as_of': as_of})
    assert response.status_code == 201, response.data
    entry = JournalEntry.objects.get(reference=response.data['journal_entry'])
    assert entry.lines.filter(account__code='4960', side='credit', amount=D('100.00')).exists()
    assert entry.auto_reverse_date == as_of + timedelta(days=1)

    reversed_refs = process_auto_reversals(as_of + timedelta(days=1))
    assert len(reversed_refs) == 1
    assert _net('4960', entry_date__range=(as_of, as_of + timedelta(days=1))) == 0


# ─── dimensions, recurring journals, cash flow, statements ───────────────────

def test_cost_center_required_and_reported(auth_client, superuser):
    account = ChartOfAccount.objects.get(code='5910')
    account.requires_cost_center = True
    account.save()
    cc = CostCenter.objects.create(code='BR-HRE', name='Harare branch')
    service = AccountingService(user=superuser)

    posting = PostingData(description='Ads', entry_date=D0)
    posting.add_debit('5910', D('40'))
    posting.add_credit('1010', D('40'))
    with pytest.raises(AccountingError, match='cost center'):
        service.post_entry(posting)

    posting = PostingData(description='Ads', entry_date=D0)
    posting.add_debit('5910', D('40'), cost_center=cc)
    posting.add_credit('1010', D('40'))
    service.post_entry(posting)
    report = auth_client(superuser).get('/api/v1/finance/reports/income-statement/', {
        'from_date': D0, 'to_date': D0, 'cost_center': cc.id}).data
    assert D(report['total_expenses']) == D('40')


def test_recurring_journal_catches_up_and_reverses(auth_client, superuser):
    from apps.finance.models import Journal

    start = (TODAY - relativedelta(months=2)).replace(day=1)
    client = auth_client(superuser)
    response = client.post('/api/v1/finance/recurring-journals/', {
        'name': 'Audit fee accrual', 'description': 'Monthly audit fee accrual',
        'journal': str(Journal.objects.get(code='GJ').id), 'frequency': 'monthly', 'next_run_date': start,
        'auto_post': True, 'reverse_next_period': True,
        'lines': [{'account': str(ChartOfAccount.objects.get(code='5920').id), 'side': 'debit', 'amount': '50'},
                  {'account': str(ChartOfAccount.objects.get(code='2300').id), 'side': 'credit', 'amount': '50'}],
    }, format='json')
    assert response.status_code == 201, response.data
    assert client.post('/api/v1/finance/recurring-journals/', {
        'name': 'Broken', 'description': 'x', 'journal': str(Journal.objects.get(code='GJ').id),
        'next_run_date': start, 'lines': [{'account': str(ChartOfAccount.objects.get(code='5920').id),
                                           'side': 'debit', 'amount': '50'}]}, format='json').status_code == 400

    result = client.post('/api/v1/finance/recurring-journals/run_due/').data['result']
    assert result.startswith('0 reversal(s), 3 recurring')
    generated = JournalEntry.objects.filter(source_module='recurring', is_reversal=False)
    assert generated.count() == 3 and all(_balanced(e) for e in generated)
    # The first two months' accruals are reversed on the 1st of the next month.
    from apps.finance.services.recurring import process_auto_reversals
    assert len(process_auto_reversals(TODAY)) == 2


def test_cash_flow_reconciles_to_bank_movement(auth_client, superuser, customer, bank):
    _customer_invoice(customer, D('500'))
    _receipt(customer, bank, D('300'))
    data = auth_client(superuser).get('/api/v1/finance/reports/cash-flow/', {
        'from_date': D0.replace(day=1), 'to_date': D0.replace(day=28)}).data
    assert data['reconciles'] is True
    assert D(data['closing_cash']) - D(data['opening_cash']) == D(data['net_change_in_cash'])


def test_customer_statement_running_balance(auth_client, superuser, customer, bank):
    _customer_invoice(customer, D('500'))
    _receipt(customer, bank, D('200'))
    client = auth_client(superuser)
    data = client.get(f'/api/v1/finance/customers/{customer.id}/statement/',
                      {'from_date': D0.replace(day=1), 'to_date': D0.replace(day=28)}).data
    assert D(data['closing_balance']) == D('300') == customer.balance
    assert [ln['balance'] for ln in data['lines']] == ['500.00', '300.00']
    pdf = client.get(f'/api/v1/finance/customers/{customer.id}/statement/',
                     {'from_date': D0.replace(day=1), 'to_date': D0.replace(day=28), 'export_format': 'pdf'})
    assert pdf.status_code == 200 and pdf.content.startswith(b'%PDF')


def test_statement_and_invoice_email(auth_client, superuser, customer, mailoutbox):
    """Invoice email imported a PDFService that didn't exist and read a missing email field."""
    inv = _customer_invoice(customer, D('60'))
    client = auth_client(superuser)
    assert client.post(f'/api/v1/finance/customer-invoices/{inv.id}/email_invoice/').status_code == 200
    assert client.post(f'/api/v1/finance/customers/{customer.id}/email_statement/', {}).status_code == 200
    assert [m.to for m in mailoutbox] == [['cara@test.local'], ['cara@test.local']]


def test_invoice_pdf_download_and_email_without_address(auth_client, superuser, customer, mailoutbox):
    inv = _customer_invoice(customer, D('75'))
    client = auth_client(superuser)
    pdf = client.get(f'/api/v1/finance/customer-invoices/{inv.id}/pdf/')
    assert pdf.status_code == 200 and pdf.content.startswith(b'%PDF')
    assert inv.invoice_number in pdf['Content-Disposition']

    customer.contact_link.email = ''
    customer.contact_link.save(update_fields=['email'])
    response = client.post(f'/api/v1/finance/customer-invoices/{inv.id}/email_invoice/')
    assert response.status_code == 400
    assert mailoutbox == []
