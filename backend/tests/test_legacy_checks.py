"""
The old manual check scripts (scripts/manual_checks/), ported to assertions:

- verify_fixed_assets      straight-line depreciation and its GL entry
- verify_asset_disposal    disposal at a gain and at a loss, and no double disposal
- verify_allocation        a receipt settles open invoices oldest-first
- check_payroll_run        approved commissions are paid through payroll and marked paid
- check_dashboard(_all_users)  the executive and agent dashboards for every role
"""

from datetime import timedelta
from decimal import Decimal as D

import pytest
from dateutil.relativedelta import relativedelta
from django.utils import timezone

from apps.crm.models import Contact
from apps.finance.models import (
    BankAccount, ChartOfAccount, CustomerInvoice, CustomerInvoiceLine, CustomerProfile, CustomerReceipt,
)
from apps.finance.services.accounting import AccountingService
from tests.conftest import OPEN_PERIOD_DATE, _make_user

pytestmark = pytest.mark.django_db

D0 = OPEN_PERIOD_DATE


# ─── fixed assets ────────────────────────────────────────────────────────────

@pytest.fixture
def vehicles(db):
    from apps.fixed_assets.models import AssetCategory

    acct = {c: ChartOfAccount.objects.get(code=c) for c in ('1520', '1590', '5700', '4900')}
    return AssetCategory.objects.create(
        code='VEH-T', name='Vehicles', asset_cost_account=acct['1520'], accum_depr_account=acct['1590'],
        depr_expense_account=acct['5700'], disposal_gain_loss_account=acct['4900'])


def _asset(category, code, cost, acquired, **book):
    from apps.fixed_assets.models import AssetBook, FixedAsset

    asset = FixedAsset.objects.create(code=code, name=code, category=category, acquisition_date=acquired,
                                      acquisition_cost=cost)
    AssetBook.objects.create(asset=asset, book_type='Statutory', method='straight_line', useful_life_months=60,
                             current_nbv=book.pop('current_nbv', cost), **book)
    return asset


def _lines(entry):
    return sorted((line.account.code, line.side, line.amount) for line in entry.lines.select_related('account'))


def test_straight_line_depreciation_posts_one_month(superuser, vehicles):
    from apps.fixed_assets.models import AssetTransaction
    from apps.fixed_assets.services.depreciation import DepreciationService

    start = D0.replace(day=1)
    asset = _asset(vehicles, 'TRUCK-1', D('50000.00'), start, salvage_value=D('5000.00'))
    month_end = start + relativedelta(months=1) - timedelta(days=1)

    results = DepreciationService(superuser).run_depreciation_for_period(asset_ids=[asset.id], end_date=month_end)

    # (50 000 - 5 000) / 60 months
    assert [(r['asset_code'], r['amount'], r['status']) for r in results] == [('TRUCK-1', D('750.00'), 'Posted')]
    book = asset.books.get()
    assert (book.current_nbv, book.accumulated_depreciation) == (D('49250.00'), D('750.00'))
    entry = AssetTransaction.objects.get(asset=asset, transaction_type='depreciation').journal_entry
    assert _lines(entry) == [('1590', 'credit', D('750.00')), ('5700', 'debit', D('750.00'))]
    # Running again for the same month posts nothing more.
    assert DepreciationService(superuser).run_depreciation_for_period(asset_ids=[asset.id], end_date=month_end) == []


@pytest.mark.parametrize('proceeds, gain_loss, gain_line', [
    (D('1800.00'), D('200.00'), ('4900', 'credit', D('200.00'))),
    (D('1500.00'), D('-100.00'), ('4900', 'debit', D('100.00'))),
])
def test_disposal_clears_the_asset_and_books_the_gain_or_loss(superuser, vehicles, proceeds, gain_loss, gain_line):
    from apps.fixed_assets.models import AssetTransaction
    from apps.fixed_assets.services.depreciation import DepreciationService

    service = DepreciationService(superuser)
    asset = _asset(vehicles, f'PC-{proceeds}', D('2000.00'), D0 - timedelta(days=365),
                   current_nbv=D('1600.00'), accumulated_depreciation=D('400.00'))

    result = service.post_asset_disposal(asset_id=asset.id, disposal_date=D0, net_proceeds=proceeds, notes='Sold')

    assert result['gain_loss'] == gain_loss
    entry = AssetTransaction.objects.get(asset=asset, transaction_type='disposal').journal_entry
    bank_code = AccountingService().ACCOUNTS['BANK_MAIN']
    assert _lines(entry) == sorted([(bank_code, 'debit', proceeds), ('1590', 'debit', D('400.00')),
                                    ('1520', 'credit', D('2000.00')), gain_line])
    asset.refresh_from_db()
    assert asset.status == 'disposed' and asset.books.get().current_nbv == 0
    with pytest.raises(ValueError, match='already disposed'):
        service.post_asset_disposal(asset_id=asset.id, disposal_date=D0, net_proceeds=proceeds)


# ─── receipt allocation ──────────────────────────────────────────────────────

def _invoice(customer, amount, on):
    inv = CustomerInvoice.objects.create(customer=customer, invoice_date=on, due_date=on, subtotal=amount,
                                         total_amount=amount)
    CustomerInvoiceLine.objects.create(invoice=inv, description='Fee', unit_price=amount, line_total=amount,
                                       revenue_account=ChartOfAccount.objects.get(code='4300'))
    entry = AccountingService().post_customer_invoice(inv)
    inv.status, inv.journal_entry = 'posted', entry
    inv.save(update_fields=['status', 'journal_entry'])
    return inv


def test_receipt_settles_invoices_oldest_first():
    contact = Contact.objects.create(first_name='Test', last_name='Customer', email='alloc@test.local')
    customer = CustomerProfile.objects.create(contact_link=contact, name='Test Customer',
                                              ar_account=ChartOfAccount.objects.get(code='1100'))
    bank, _ = BankAccount.objects.get_or_create(
        gl_account=ChartOfAccount.objects.get(code='1010'),
        defaults={'name': 'Main', 'bank_name': 'Test Bank', 'account_number': '000111'})
    older = _invoice(customer, D('1000.00'), D0 - timedelta(days=10))
    newer = _invoice(customer, D('500.00'), D0)
    assert customer.balance == D('1500.00')

    receipt = CustomerReceipt.objects.create(customer=customer, receipt_date=D0, amount=D('1250.00'),
                                             bank_account=bank)
    AccountingService().post_customer_receipt(receipt)

    older.refresh_from_db()
    newer.refresh_from_db()
    assert (older.status, older.amount_paid) == ('paid', D('1000.00'))
    assert (newer.status, newer.amount_paid) == ('partial', D('250.00'))
    assert customer.balance == D('250.00')


# ─── payroll and commissions ─────────────────────────────────────────────────

def test_approved_commission_is_paid_through_payroll(auth_client, superuser):
    from apps.commissions.models import CommissionRecord
    from apps.hr.models import EmployeeContract
    from apps.payroll.models import PayrollRun
    from apps.properties.models import Property

    today = timezone.localdate()
    start = today.replace(day=1)
    contract = EmployeeContract.objects.filter(status='running').select_related('employee').first()
    assert contract, 'seed data should include a running contract'
    commission = CommissionRecord.objects.create(
        reference='TEST-COMM-001', agent=contract.employee, property=Property.objects.first(),
        transaction_type='sale', transaction_amount=D('100000'), company_commission_rate=D('5'),
        company_commission_amount=D('5000'), agent_split_rate=D('60'), gross_commission=D('3000'),
        net_commission=D('800.00'), status='approved', approved_date=today)
    run = PayrollRun.objects.create(name='Commission run', period_start=start,
                                    period_end=start + relativedelta(months=1) - timedelta(days=1))

    client = auth_client(superuser)
    assert client.post(f'/api/v1/payroll/runs/{run.id}/process/').status_code == 200
    payslip = run.payslips.get(employee=contract.employee)
    lines = {line.code: line.amount for line in payslip.lines.all()}
    assert lines['COMM'] == D('800.00') and lines['BASIC'] == contract.wage
    run.refresh_from_db()
    assert run.currency.is_base

    checker = _make_user('payroll-checker@test.local', superuser=True)
    assert auth_client(checker).post(f'/api/v1/payroll/runs/{run.id}/approve/').status_code == 200
    assert client.post(f'/api/v1/payroll/runs/{run.id}/pay_all/').status_code == 200
    commission.refresh_from_db()
    assert commission.status == 'paid' and commission.payment_reference == f'PAY-{run.id}'


# ─── dashboards for every role ───────────────────────────────────────────────

def test_dashboards_work_for_every_role(auth_client):
    from apps.core.models import Role
    from apps.hr.models import Employee

    for i, role in enumerate(Role.objects.order_by('role_type')):
        user = _make_user(f'dash{i}@test.local', role_type=role.role_type)
        client = auth_client(user)
        executive = client.get('/api/v1/dashboard/executive/')
        assert executive.status_code in (200, 403), f'{role.role_type}: executive {executive.status_code}'
        agent = client.get('/api/v1/dashboard/agent/')
        assert agent.status_code in (200, 403, 404), f'{role.role_type}: agent {agent.status_code}'

    # An agent linked to an employee gets their own figures.
    agent_user = _make_user('dash-agent@test.local', role_type='agent')
    employee = Employee.objects.filter(user__isnull=True).first()
    employee.user = agent_user
    employee.save(update_fields=['user'])
    response = auth_client(agent_user).get('/api/v1/dashboard/agent/')
    assert response.status_code == 200 and response.data['agent_name'] == employee.full_name
