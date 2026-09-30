"""
Regression tests for the ERP gap-closure pass (see docs/GAP_ANALYSIS.md):
privilege escalation, ledger/report integrity, year-end close, rental billing
and AR sync, deposits, commission and payroll accruals, and the new reports.
"""

from datetime import date, timedelta
from decimal import Decimal as D
from io import StringIO

import pytest
from dateutil.relativedelta import relativedelta
from django.core.management import call_command
from django.db.models import Q, Sum
from django.utils import timezone

from apps.core.models import Role
from apps.crm.models import Contact
from apps.finance.models import (
    BankAccount, ChartOfAccount, CustomerInvoice, FiscalYear, Journal, JournalEntry, JournalLine, PostingProfile,
)
from apps.finance.seeds import ensure_fiscal_year
from apps.finance.services.accounting import AccountingError, AccountingService, PostingData
from apps.properties.models import Property, PropertyType
from apps.rentals.models import Lease, RentalInvoice, RentalPayment
from apps.rentals.services.billing import generate_due_invoices
from tests.conftest import OPEN_PERIOD_DATE, _make_user
from utils.permissions import resolve_policy

pytestmark = pytest.mark.django_db

TODAY = timezone.localdate()


# ─── helpers / fixtures ───────────────────────────────────────────────────────

def _entry_is_balanced(entry):
    return entry.get_total_debits() == entry.get_total_credits() > 0


def _ledger_net(account_code, **entry_filters):
    """Debit-minus-credit over ledger-effective lines of an account."""
    agg = JournalLine.objects.filter(
        account__code=account_code, entry__status__in=JournalEntry.LEDGER_STATUSES,
        **{f'entry__{k}': v for k, v in entry_filters.items()},
    ).aggregate(dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
    return (agg['dr'] or D('0')) - (agg['cr'] or D('0'))


@pytest.fixture
def agent(db):
    return _make_user('agent@test.local', role_type='agent')


@pytest.fixture
def bank_account(db):
    gl = ChartOfAccount.objects.get(code='1010')
    account, _ = BankAccount.objects.get_or_create(
        gl_account=gl, defaults={'name': 'Main', 'bank_name': 'Test Bank', 'account_number': '000111'})
    return account


@pytest.fixture
def lease_factory(db, bank_account):
    ptype = PropertyType.objects.first()
    counter = {'n': 0}

    def make(**overrides):
        counter['n'] += 1
        tenant = Contact.objects.create(first_name='Tina', last_name=f'Tenant{counter["n"]}',
                                        email=f'tenant{counter["n"]}@test.local', contact_type='tenant')
        prop = Property.objects.create(name=f'Test Flat {counter["n"]}', property_type=ptype,
                                       address_line1='1 Test Road')
        fields = dict(property=prop, tenant=tenant, status=Lease.LeaseStatus.ACTIVE,
                      start_date=OPEN_PERIOD_DATE.replace(day=1), monthly_rental=D('1000.00'),
                      rental_escalation_rate=D('0'), payment_due_days=5)
        fields.update(overrides)
        return Lease.objects.create(**fields)

    return make


def _sent_invoice(lease, **overrides):
    fields = dict(lease=lease, period_start=OPEN_PERIOD_DATE.replace(day=1),
                  period_end=OPEN_PERIOD_DATE.replace(day=28), due_date=OPEN_PERIOD_DATE,
                  status=RentalInvoice.InvoiceStatus.SENT, rental_amount=D('1000.00'),
                  vat_amount=D('0.00'), total_amount=D('1000.00'), balance_due=D('1000.00'))
    fields.update(overrides)
    return RentalInvoice.objects.create(**fields)


# ─── security ────────────────────────────────────────────────────────────────

def test_user_cannot_grant_themselves_roles_via_me(auth_client, agent):
    super_admin = Role.objects.get(role_type='super_admin')
    response = auth_client(agent).patch('/api/v1/core/me/', {'role_ids': [str(super_admin.id)]}, format='json')
    assert response.status_code == 200
    assert not agent.roles.filter(role_type='super_admin').exists()


def test_user_cannot_reset_someone_elses_password(auth_client, agent, superuser):
    body = {'password': 'An0ther-str0ng-pass!', 'password_confirm': 'An0ther-str0ng-pass!'}
    assert auth_client(agent).post(f'/api/v1/core/users/{superuser.id}/set-password/', body).status_code == 403
    assert auth_client(agent).post(f'/api/v1/core/users/{agent.id}/set-password/', body).status_code == 200
    assert auth_client(superuser).post(f'/api/v1/core/users/{agent.id}/set-password/', body).status_code == 200


def test_only_access_admins_manage_roles_and_sod(auth_client, agent, superuser):
    payload = {'name': 'Rogue', 'role_type': 'viewer'}
    assert auth_client(agent).post('/api/v1/core/roles/', payload).status_code == 403
    assert auth_client(agent).get('/api/v1/core/roles/').status_code == 403
    assert auth_client(superuser).post('/api/v1/core/roles/', payload).status_code == 201


def test_payroll_api_requires_payroll_module(auth_client, agent, superuser):
    assert auth_client(agent).get('/api/v1/payroll/runs/').status_code == 403
    assert auth_client(superuser).get('/api/v1/payroll/runs/').status_code == 200


ROLE_CAN_READ = {
    'agent': ['crm/contacts/', 'crm/opportunities/', 'properties/', 'hr/employees/', 'dashboard/executive/'],
    'rental_manager': ['rentals/leases/', 'rentals/invoices/', 'crm/contacts/', 'properties/', 'hr/employees/',
                       'documents/'],
    'sales_manager': ['sales/transactions/', 'crm/contacts/', 'properties/', 'hr/employees/'],
    'hr_manager': ['hr/employees/', 'hr/leave/', 'documents/'],
    'accountant': ['finance/entries/', 'finance/supplier-invoices/', 'finance/customer-invoices/',
                   'finance/periods/', 'finance/reports/ar-aging/', 'banking/statements/',
                   'finance/reports/vat-return/?from_date=2025-01-01&to_date=2025-12-31', 'crm/contacts/'],
    'finance_manager': ['fixed-assets/assets/', 'commissions/records/', 'finance/batches/'],
}
ROLE_CANNOT_READ = {
    'agent': ['finance/entries/', 'finance/supplier-invoices/', 'payroll/runs/', 'commissions/records/',
              'core/users/', 'core/audit-logs/', 'banking/statements/'],
    'rental_manager': ['finance/entries/', 'payroll/runs/', 'sales/transactions/'],
    'hr_manager': ['finance/entries/', 'sales/transactions/', 'payroll/runs/'],
    'accountant': ['payroll/runs/', 'hr/employees/', 'core/users/'],
}


@pytest.mark.parametrize('role,url', [(r, u) for r, urls in ROLE_CAN_READ.items() for u in urls])
def test_role_can_read_its_screens(auth_client, role, url):
    user = _make_user(f'{role}@test.local', role_type=role)
    response = auth_client(user).get(f'/api/v1/{url}')
    assert response.status_code == 200, f'{role} GET {url} -> {response.status_code}'


@pytest.mark.parametrize('role,url', [(r, u) for r, urls in ROLE_CANNOT_READ.items() for u in urls])
def test_role_is_refused_other_modules(auth_client, role, url):
    user = _make_user(f'{role}@test.local', role_type=role)
    assert auth_client(user).get(f'/api/v1/{url}').status_code == 403


def test_agent_cannot_post_journals_or_unlock_periods(auth_client, agent):
    from apps.finance.models import FiscalPeriod

    client = auth_client(agent)
    period = FiscalPeriod.objects.first()
    assert client.post(f'/api/v1/finance/periods/{period.id}/unlock/').status_code == 403
    assert client.post('/api/v1/finance/entries/', {}, format='json').status_code == 403
    assert client.post('/api/v1/core/data/import/coa/').status_code == 403


def test_rental_manager_reads_ar_but_cannot_write_it(auth_client):
    """Rental managers may read AR invoices for their tenants but not post them."""
    rental = _make_user('rm@test.local', role_type='rental_manager')
    client = auth_client(rental)
    assert client.get('/api/v1/finance/customer-invoices/').status_code == 200
    assert client.post('/api/v1/finance/customer-invoices/', {}, format='json').status_code == 403


def test_rental_manager_can_create_tenant_contact(auth_client):
    rental = _make_user('rm2@test.local', role_type='rental_manager')
    response = auth_client(rental).post('/api/v1/crm/contacts/', {
        'first_name': 'New', 'last_name': 'Tenant', 'email': 'new.tenant@test.local', 'contact_type': 'tenant'})
    assert response.status_code == 201, response.data


def test_critical_sod_rule_blocks_module_server_side(auth_client):
    from apps.core.models import Module, SODRule

    user = _make_user('sod@test.local', role_type='finance_manager')  # has finance_ap and finance_gl
    SODRule.objects.update_or_create(
        module_a=Module.objects.get(code='finance_ap'), module_b=Module.objects.get(code='finance_gl'),
        defaults={'name': 'AP vs GL', 'severity': 'critical', 'description': 'test', 'is_active': True})
    client = auth_client(user)
    assert client.get('/api/v1/finance/supplier-invoices/').status_code == 200
    assert client.get('/api/v1/finance/batches/').status_code == 403


def test_module_policy_resolution():
    assert resolve_policy('/api/v1/finance/batches/') == ({'finance_gl'}, {'finance_gl'})
    read, write = resolve_policy('/api/v1/finance/entries/42/post_entry/')
    assert 'finance_ap' in read and write == {'finance_gl'}
    read, write = resolve_policy('/api/v1/crm/contacts/')
    assert 'rentals' in read and 'rentals' in write  # rental managers create tenants
    assert resolve_policy('/api/v1/unknown/') is None


# ─── ledger integrity ─────────────────────────────────────────────────────────

def test_reversed_entries_stay_in_reports(superuser):
    """Reports used to drop the original (REVERSED) and keep only its reversal."""
    service = AccountingService(user=superuser)
    posting = PostingData(description='Mistake', entry_date=TODAY)
    posting.add_debit('1010', D('250.00'))
    posting.add_credit('4900', D('250.00'))
    before = _ledger_net('4900')
    entry = service.post_entry(posting)
    service.create_reversal(entry)
    assert _ledger_net('4900') == before


def test_income_statement_requires_dates(auth_client, superuser):
    response = auth_client(superuser).get('/api/v1/finance/reports/income-statement/')
    assert response.status_code == 400


# ─── year-end close ───────────────────────────────────────────────────────────

@pytest.fixture
def future_year(db):
    return ensure_fiscal_year(date(2031, 6, 1))


def test_year_end_close_moves_profit_to_retained_earnings(superuser, future_year, auth_client):
    service = AccountingService(user=superuser)
    mid = future_year.start_date + timedelta(days=40)
    sale = PostingData(description='Rent', entry_date=mid)
    sale.add_debit('1010', D('1000.00'))
    sale.add_credit('4100', D('1000.00'))
    service.post_entry(sale)
    cost = PostingData(description='Repairs', entry_date=mid)
    cost.add_debit('5300', D('400.00'))
    cost.add_credit('1010', D('400.00'))
    service.post_entry(cost)

    retained = PostingProfile.objects.get(is_default=True).retained_earnings.code
    re_before = _ledger_net(retained)
    in_year = {'entry_date__range': (future_year.start_date, future_year.end_date)}

    response = auth_client(superuser).post(f'/api/v1/finance/fiscal-years/{future_year.id}/close_year/')
    assert response.status_code == 200, response.data
    closing = JournalEntry.objects.get(reference=response.data['closing_entry'])
    assert closing.journal.code == 'YE' and _entry_is_balanced(closing)

    assert _ledger_net(retained) - re_before == D('-600.00')  # credit = profit
    assert _ledger_net('4100', **in_year) == 0
    assert _ledger_net('5300', **in_year) == 0
    future_year.refresh_from_db()
    assert future_year.is_closed
    assert not future_year.periods.exclude(status='closed').exists()

    # The income statement still reports the year's trading.
    report = auth_client(superuser).get('/api/v1/finance/reports/income-statement/', {
        'from_date': future_year.start_date, 'to_date': future_year.end_date}).data
    assert D(report['net_profit']) == D('600.00')

    # Reopening reverses the closing entry.
    response = auth_client(superuser).post(f'/api/v1/finance/fiscal-years/{future_year.id}/reopen_year/')
    assert response.status_code == 200
    assert _ledger_net(retained) == re_before
    assert _ledger_net('4100', **in_year) == D('-1000.00')


def test_year_end_close_refuses_unposted_entries(superuser, future_year):
    JournalEntry.objects.create(
        reference='DRAFT-YE-TEST', journal=Journal.objects.get(code='GJ'),
        fiscal_period=future_year.periods.first(), entry_date=future_year.start_date,
        description='Draft', status=JournalEntry.EntryStatus.DRAFT)
    with pytest.raises(AccountingError, match='unposted'):
        AccountingService(user=superuser).close_fiscal_year(future_year)


# ─── rentals → AR ─────────────────────────────────────────────────────────────

def test_rental_invoice_with_vat_and_late_fee_posts_balanced(lease_factory):
    """VAT/late-fee invoices used to be unbalanced and silently never posted."""
    lease = lease_factory(vat_applicable=True)
    invoice = _sent_invoice(lease, vat_amount=D('155.00'), late_payment_fee=D('50.00'),
                            total_amount=D('1205.00'), balance_due=D('1205.00'))
    invoice.refresh_from_db()
    assert invoice.is_posted_to_finance
    assert _entry_is_balanced(invoice.journal_entry)
    ar = CustomerInvoice.objects.get(invoice_number=f'AR-{invoice.invoice_number}')
    assert ar.total_amount == D('1205.00')
    assert invoice.journal_entry.lines.filter(account__code='2100', side='credit', amount=D('155.00')).exists()
    assert invoice.journal_entry.lines.filter(account__code='4910', side='credit', amount=D('50.00')).exists()


def test_rental_payment_settles_only_its_invoice(lease_factory, bank_account):
    """The receipt was applied FIFO *and* to the mirrored invoice: paid twice."""
    lease = lease_factory()
    first = _sent_invoice(lease)
    second = _sent_invoice(lease, period_start=OPEN_PERIOD_DATE.replace(day=2))
    RentalPayment.objects.create(invoice=second, payment_date=OPEN_PERIOD_DATE, amount=D('1000.00'),
                                 payment_method='eft', reference='PAY-SECOND')
    ar_first = CustomerInvoice.objects.get(invoice_number=f'AR-{first.invoice_number}')
    ar_second = CustomerInvoice.objects.get(invoice_number=f'AR-{second.invoice_number}')
    assert ar_first.amount_paid == 0
    assert ar_second.amount_paid == D('1000.00')
    assert ar_second.status == CustomerInvoice.InvoiceStatus.PAID


def test_overdue_late_fee_is_posted_to_ar(lease_factory):
    lease = lease_factory(start_date=TODAY - timedelta(days=40))
    invoice = _sent_invoice(lease, period_start=TODAY - timedelta(days=40), period_end=TODAY - timedelta(days=11),
                            due_date=TODAY - timedelta(days=10))
    call_command('process_rental_overdue', stdout=StringIO())
    invoice.refresh_from_db()
    assert invoice.late_payment_fee == D('100.00')
    ar_total = CustomerInvoice.objects.filter(
        invoice_number__startswith=f'AR-{invoice.invoice_number}').aggregate(t=Sum('total_amount'))['t']
    assert ar_total == invoice.total_amount == D('1100.00')


# ─── recurring billing ───────────────────────────────────────────────────────

def test_billing_generates_months_with_escalation_and_is_idempotent(lease_factory):
    start = (TODAY - relativedelta(months=13)).replace(day=1)
    lease = lease_factory(start_date=start, rental_escalation_rate=D('10.00'))

    result = generate_due_invoices(TODAY, leases=Lease.objects.filter(pk=lease.pk))
    assert result.errors == []
    invoices = list(lease.invoices.order_by('period_start'))
    assert len(invoices) == 14
    assert invoices[11].rental_amount == D('1000.00')
    assert invoices[12].rental_amount == D('1100.00')  # first anniversary
    assert all(i.is_posted_to_finance and i.status == 'sent' for i in invoices)

    again = generate_due_invoices(TODAY, leases=Lease.objects.filter(pk=lease.pk))
    assert again.created == [] and lease.invoices.count() == 14
    lease.refresh_from_db()
    assert lease.monthly_rental == D('1100.00')


def test_generate_invoices_endpoint(auth_client, superuser, lease_factory):
    lease = lease_factory(start_date=TODAY.replace(day=1))
    response = auth_client(superuser).post(f'/api/v1/rentals/leases/{lease.id}/generate_invoices/')
    assert response.status_code == 200, response.data
    assert len(response.data['created']) == 1


# ─── deposits ────────────────────────────────────────────────────────────────

def test_deposit_received_and_released_against_arrears(auth_client, superuser, lease_factory):
    lease = lease_factory(deposit_amount=D('1500.00'))
    client = auth_client(superuser)
    trust_before = _ledger_net('1020')

    response = client.post(f'/api/v1/rentals/leases/{lease.id}/record_deposit/', {'date': OPEN_PERIOD_DATE})
    assert response.status_code == 200, response.data
    assert _ledger_net('1020') - trust_before == D('1500.00')

    invoice = _sent_invoice(lease)  # 1000 of arrears
    response = client.post(f'/api/v1/rentals/leases/{lease.id}/refund_deposit/',
                           {'applied_to_arrears': '1000.00', 'date': OPEN_PERIOD_DATE})
    assert response.status_code == 200, response.data
    assert response.data['refunded'] == '500.00'
    assert _ledger_net('1020') - trust_before == D('1000.00')  # 500 refunded out of trust
    invoice.refresh_from_db()
    assert invoice.status == 'paid'
    assert CustomerInvoice.objects.get(invoice_number=f'AR-{invoice.invoice_number}').status == 'paid'


# ─── commissions & payroll ────────────────────────────────────────────────────

def test_commission_approval_accrues_expense(auth_client, superuser):
    from apps.commissions.models import CommissionRecord
    from apps.hr.models import Employee

    record = CommissionRecord.objects.create(
        reference='COMM-TEST-1', agent=Employee.objects.first(), transaction_type='sale',
        property=Property.objects.first(), transaction_amount=D('100000'), company_commission_rate=D('5'),
        company_commission_amount=D('5000'), agent_split_rate=D('50'), gross_commission=D('2500'),
        net_commission=D('2500'), status='pending')
    response = auth_client(superuser).post(f'/api/v1/commissions/records/{record.id}/approve/')
    assert response.status_code == 200, response.data
    record.refresh_from_db()
    entry = record.journal_entry
    assert _entry_is_balanced(entry)
    assert entry.lines.filter(account__code='5100', side='debit', amount=D('2500')).exists()
    assert entry.lines.filter(account__code='2400', side='credit', amount=D('2500')).exists()


def test_payroll_accrual_is_balanced_and_not_duplicated(auth_client, superuser):
    from apps.payroll.models import PayrollRun

    period_start = TODAY.replace(day=1)
    run = PayrollRun.objects.create(name='Test run', period_start=period_start,
                                    period_end=period_start + relativedelta(months=1) - timedelta(days=1))
    client = auth_client(superuser)
    for _ in range(2):
        response = client.post(f'/api/v1/payroll/runs/{run.id}/process/')
        assert response.status_code == 200, response.data
        assert 'gl_warning' not in response.data, response.data.get('gl_warning')

    entries = JournalEntry.objects.filter(source_module='payroll', source_id=run.id)
    assert entries.count() == 1
    entry = entries.get()
    assert _entry_is_balanced(entry)
    run.refresh_from_db()
    assert entry.lines.filter(account__code='2630', side='credit', amount=run.total_net).exists()
    # The AP invoice for net pay clears Net Salaries Payable, not wages again.
    assert run.supplier_invoice.lines.get().expense_account.code == '2630'


# ─── reports ─────────────────────────────────────────────────────────────────

def test_ar_aging_buckets_open_invoices(auth_client, superuser, lease_factory):
    lease = lease_factory()
    _sent_invoice(lease, due_date=TODAY - timedelta(days=45), period_start=TODAY - timedelta(days=50))
    data = auth_client(superuser).get('/api/v1/finance/reports/ar-aging/').data
    row = next(r for r in data['rows'] if r['name'] == lease.tenant.full_name)
    assert D(row['31_60']) == D('1000.00') and D(row['total']) == D('1000.00')
    assert sum(D(data['totals'][b['key']]) for b in data['buckets']) == D(data['totals']['total'])


def test_ap_aging_and_export(auth_client, superuser):
    client = auth_client(superuser)
    assert client.get('/api/v1/finance/reports/ap-aging/').status_code == 200
    response = client.get('/api/v1/finance/reports/export/ar-aging/')
    assert response.status_code == 200 and response['Content-Type'] == 'text/csv'


def test_general_ledger_running_balance(auth_client, superuser):
    service = AccountingService(user=superuser)
    posting = PostingData(description='GL test', entry_date=OPEN_PERIOD_DATE)
    posting.add_debit('5920', D('75.00'))
    posting.add_credit('1010', D('75.00'))
    service.post_entry(posting)
    data = auth_client(superuser).get('/api/v1/finance/reports/general-ledger/', {
        'account': '5920', 'from_date': OPEN_PERIOD_DATE, 'to_date': OPEN_PERIOD_DATE}).data
    assert D(data['closing_balance']) == D(data['opening_balance']) + D(data['total_debit']) - D(data['total_credit'])
    assert data['lines'][-1]['balance'] == data['closing_balance']


def test_budget_vs_actual(auth_client, superuser):
    client = auth_client(superuser)
    fy = FiscalYear.objects.filter(start_date__lte=OPEN_PERIOD_DATE, end_date__gte=OPEN_PERIOD_DATE).get()
    period = fy.periods.get(start_date__lte=OPEN_PERIOD_DATE, end_date__gte=OPEN_PERIOD_DATE)
    account = ChartOfAccount.objects.get(code='5910')
    response = client.post('/api/v1/finance/budgets/', {
        'fiscal_period': period.id, 'account': account.id, 'budgeted_amount': '300.00'})
    assert response.status_code == 201, response.data
    assert client.post('/api/v1/finance/budgets/', {
        'fiscal_period': period.id, 'account': ChartOfAccount.objects.get(code='1010').id,
        'budgeted_amount': '1'}).status_code == 400  # balance-sheet accounts can't be budgeted

    posting = PostingData(description='Ads', entry_date=OPEN_PERIOD_DATE)
    posting.add_debit('5910', D('120.00'))
    posting.add_credit('1010', D('120.00'))
    AccountingService(user=superuser).post_entry(posting)

    data = client.get('/api/v1/finance/reports/budget-vs-actual/', {'fiscal_year': fy.id, 'period': period.id}).data
    row = next(r for r in data['rows'] if r['code'] == '5910')
    assert D(row['budget']) == D('300.00')
    assert D(row['variance']) == D(row['actual']) - D('300.00')


# ─── bootstrap ───────────────────────────────────────────────────────────────

def test_bootstrap_provides_finance_defaults():
    """A production install (bootstrap only, no seed_demo) must be able to post."""
    assert Journal.objects.filter(code__in=['GJ', 'SJ', 'RJ', 'CJ', 'PJ', 'YE']).count() == 6
    assert PostingProfile.objects.filter(is_default=True).exists()
    assert ChartOfAccount.objects.filter(code__in=['2010', '2630', '3200', '4910']).count() == 4
    assert FiscalYear.objects.filter(start_date__lte=TODAY, end_date__gte=TODAY).exists()
