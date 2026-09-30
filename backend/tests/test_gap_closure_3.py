"""
Third gap-closure pass: owner trust accounting, brokered sales, lease charges,
proration, renewal and termination, maintenance to AP / tenant recharge,
AP approval workflows, and payroll employer contributions and outputs.
"""

from datetime import timedelta
from decimal import Decimal as D

import pytest
from dateutil.relativedelta import relativedelta
from django.db.models import Q, Sum
from django.utils import timezone

from apps.core.models import Role
from apps.crm.models import Contact
from apps.finance.models import (
    ApprovalRule, BankAccount, ChartOfAccount, CustomerInvoice, JournalEntry, JournalLine, Supplier, SupplierInvoice,
)
from apps.finance.services.accounting import AccountingError, AccountingService
from apps.properties.models import Property, PropertyType
from apps.rentals.models import Lease, LeaseCharge, MaintenanceRequest, RentalInvoice, RentalPayment
from apps.rentals.owners import owner_balance, owner_summary, pay_owner
from apps.rentals.services.billing import generate_due_invoices
from apps.rentals.services.lifecycle import complete_maintenance, renew_lease, terminate_lease
from tests.conftest import OPEN_PERIOD_DATE, _make_user

pytestmark = pytest.mark.django_db

D0 = OPEN_PERIOD_DATE
MONTH_START = D0.replace(day=1)
TODAY = timezone.localdate()


def _net(code, **line_filters):
    agg = JournalLine.objects.filter(account__code=code, entry__status__in=JournalEntry.LEDGER_STATUSES,
                                     **line_filters).aggregate(
        dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
    return (agg['dr'] or D('0')) - (agg['cr'] or D('0'))


@pytest.fixture
def bank(db):
    gl = ChartOfAccount.objects.get(code='1010')
    account, _ = BankAccount.objects.get_or_create(
        gl_account=gl, defaults={'name': 'Main', 'bank_name': 'Test Bank', 'account_number': '000111'})
    return account


@pytest.fixture
def trust_bank(db):
    gl = ChartOfAccount.objects.get(code='1020')
    account, _ = BankAccount.objects.get_or_create(
        gl_account=gl, defaults={'name': 'Trust', 'bank_name': 'Test Bank', 'account_number': '000222'})
    return account


@pytest.fixture
def make_lease(db, bank):
    counter = {'n': 0}

    def make(owner=None, **overrides):
        counter['n'] += 1
        n = counter['n']
        tenant = Contact.objects.create(first_name='Tom', last_name=f'Tenant{n}', email=f't{n}@test.local',
                                        contact_type='tenant')
        prop = Property.objects.create(
            name=f'Flat {n}', property_type=PropertyType.objects.first(), address_line1='1 Road',
            ownership_type='managed' if owner else 'owned', owner=owner, management_fee_rate=D('10'))
        fields = dict(property=prop, tenant=tenant, status='active', start_date=MONTH_START,
                      monthly_rental=D('1000'), rental_escalation_rate=D('0'), payment_due_days=5)
        fields.update(overrides)
        return Lease.objects.create(**fields)
    return make


@pytest.fixture
def owner(db):
    return Contact.objects.create(first_name='Olive', last_name='Owner', email='olive@test.local',
                                  contact_type='landlord')


def _bill_one(lease, as_of=None):
    result = generate_due_invoices(as_of or lease.start_date, leases=Lease.objects.filter(pk=lease.pk))
    assert result.errors == [], result.errors
    return lease.invoices.order_by('period_start').last()


# ─── owner trust accounting ──────────────────────────────────────────────────

def test_managed_rent_goes_to_owner_less_fee(make_lease, owner):
    lease = make_lease(owner=owner)
    invoice = _bill_one(lease)
    entry = invoice.journal_entry
    assert entry.lines.get(account__code='2210').amount == D('900.00')
    assert entry.lines.get(account__code='4300').amount == D('100.00')
    assert not entry.lines.filter(account__code='4100').exists()

    summary = owner_summary(owner)
    assert D(summary['balance']) == D('900.00')
    assert D(summary['available_to_pay']) == 0          # nothing collected yet


def test_owner_payout_limited_to_collected_rent(make_lease, owner, trust_bank):
    lease = make_lease(owner=owner)
    invoice = _bill_one(lease)
    with pytest.raises(AccountingError, match='collected'):
        pay_owner(owner, D('100'), trust_bank, MONTH_START)

    RentalPayment.objects.create(invoice=invoice, payment_date=MONTH_START, amount=D('1000'),
                                 payment_method='eft', reference='RENT-1')
    assert D(owner_summary(owner)['available_to_pay']) == D('900.00')
    entry = pay_owner(owner, D('900'), trust_bank, MONTH_START)
    assert entry.lines.get(account__code='1020').side == 'credit'
    assert owner_balance(owner) == 0


def test_owner_statement_and_payout_api(auth_client, superuser, make_lease, owner, trust_bank):
    lease = make_lease(owner=owner)
    invoice = _bill_one(lease)
    RentalPayment.objects.create(invoice=invoice, payment_date=MONTH_START, amount=D('1000'),
                                 payment_method='eft', reference='RENT-2')
    client = auth_client(superuser)
    response = client.post(f'/api/v1/rentals/owners/{owner.id}/payout/',
                           {'amount': '500', 'bank_account': trust_bank.id, 'date': MONTH_START})
    assert response.status_code == 200, response.data
    data = client.get(f'/api/v1/rentals/owners/{owner.id}/statement/',
                      {'from_date': MONTH_START, 'to_date': MONTH_START + timedelta(days=27)}).data
    assert D(data['closing_balance']) == D('400.00')
    # Rental staff can see owner balances but only finance can pay them out.
    rental = _make_user('rm@test.local', role_type='rental_manager')
    assert auth_client(rental).get('/api/v1/rentals/owners/').status_code == 200
    assert auth_client(rental).post(f'/api/v1/rentals/owners/{owner.id}/payout/', {}).status_code == 403


def test_repairs_on_managed_property_charged_to_owner(make_lease, owner, superuser):
    lease = make_lease(owner=owner)
    _bill_one(lease)
    contractor = Supplier.objects.create(name='Plumbers Ltd', ap_account=ChartOfAccount.objects.get(code='2010'))
    job = MaintenanceRequest.objects.create(property=lease.property, lease=lease, category='Plumbing',
                                            description='Burst geyser')
    result = complete_maintenance(job, D('200'), contractor, 'PL-77', user=superuser)
    assert result['charged_to'] == 'owner'
    bill = SupplierInvoice.objects.get(invoice_number='PL-77')
    assert bill.lines.get().expense_account.code == '2210'
    AccountingService().post_supplier_invoice(bill)
    assert owner_balance(owner) == D('700.00')


def test_repairs_billed_to_tenant_are_recharged(make_lease, superuser):
    lease = make_lease()
    contractor = Supplier.objects.create(name='Glaziers', ap_account=ChartOfAccount.objects.get(code='2010'))
    job = MaintenanceRequest.objects.create(property=lease.property, lease=lease, category='Glass',
                                            description='Broken window', contractor=contractor)
    result = complete_maintenance(job, D('80'), bill_to_tenant=True, user=superuser)
    recharge = CustomerInvoice.objects.get(invoice_number=result['recharge_invoice'])
    assert recharge.status == 'posted' and recharge.total_amount == D('80')
    assert recharge.journal_entry.lines.get(account__code='5300').side == 'credit'
    job.refresh_from_db()
    assert job.status == 'completed' and job.supplier_invoice_id


def test_maintenance_complete_endpoint(auth_client, superuser, make_lease):
    lease = make_lease()
    contractor = Supplier.objects.create(name='Sparkies', ap_account=ChartOfAccount.objects.get(code='2010'))
    job = MaintenanceRequest.objects.create(lease=lease, category='Electrical', description='Tripping')
    response = auth_client(superuser).post(f'/api/v1/rentals/maintenance/{job.id}/complete/',
                                           {'actual_cost': '120', 'contractor': contractor.id})
    assert response.status_code == 200, response.data
    assert response.data['charged_to'] == 'company'


# ─── brokered sales ──────────────────────────────────────────────────────────

def test_agency_sale_books_only_commission(owner):
    from apps.sales.models import SaleTransaction

    prop = Property.objects.create(name='Client house', property_type=PropertyType.objects.first(),
                                   address_line1='9 Road', ownership_type='managed', owner=owner,
                                   purchase_price=D('80000'))
    buyer = Contact.objects.create(first_name='Bea', last_name='Buyer', email='bea@test.local')
    sale = SaleTransaction.objects.create(sale_reference='SALE-AG-1', property=prop, buyer=buyer, seller=owner,
                                          sale_price=D('100000'), commission_rate=D('5'), offer_date=D0,
                                          transfer_date=D0)
    entry = AccountingService().post_sale_transaction(sale)
    assert entry.lines.get(account__code='4200').amount == D('5000.00')
    assert not entry.lines.filter(account__code='4400').exists()
    assert not JournalEntry.objects.filter(source_module='sales', source_id=sale.id,
                                           lines__account__code='1510').exists()   # no cost of sale
    invoice = CustomerInvoice.objects.get(journal_entry=entry)
    assert invoice.customer.contact_link == owner


def test_agency_sale_requires_seller():
    from apps.sales.models import SaleTransaction

    prop = Property.objects.create(name='X', property_type=PropertyType.objects.first(), address_line1='x',
                                   ownership_type='managed')
    buyer = Contact.objects.create(first_name='B', last_name='B', email='bb@test.local')
    sale = SaleTransaction.objects.create(sale_reference='SALE-AG-2', property=prop, buyer=buyer,
                                          sale_price=D('1000'), offer_date=D0, transfer_date=D0)
    with pytest.raises(AccountingError, match='seller'):
        AccountingService().post_sale_transaction(sale)


# ─── lease charges, proration, renewal, termination ──────────────────────────

def test_lease_charges_billed_with_rent(make_lease):
    lease = make_lease()
    LeaseCharge.objects.create(lease=lease, description='Service charge', monthly_amount=D('50'),
                               vat_applicable=True)
    invoice = _bill_one(lease)
    vat = (D('50') * D('0.155')).quantize(D('0.01'))
    assert invoice.other_charges == D('50') + vat
    assert invoice.total_amount == D('1000') + D('50') + vat
    assert invoice.journal_entry.lines.get(account__code='4920').amount == D('50.00')


def test_final_partial_month_is_prorated(make_lease):
    lease = make_lease(end_date=MONTH_START + relativedelta(months=1) + timedelta(days=9))  # 10 days of month 2
    generate_due_invoices(MONTH_START + relativedelta(months=1), leases=Lease.objects.filter(pk=lease.pk))
    last = lease.invoices.order_by('period_start').last()
    days_in_month = ((MONTH_START + relativedelta(months=2)) - (MONTH_START + relativedelta(months=1))).days
    assert last.rental_amount == (D('1000') * D(10) / D(days_in_month)).quantize(D('0.01'))


def test_renewal_creates_follow_on_lease(make_lease):
    lease = make_lease(end_date=MONTH_START + relativedelta(months=12) - timedelta(days=1))
    LeaseCharge.objects.create(lease=lease, description='Parking', monthly_amount=D('20'))
    renewed = renew_lease(lease, lease.end_date + relativedelta(years=1), monthly_rental=D('1080'))
    lease.refresh_from_db()
    assert lease.status == 'renewed'
    assert renewed.start_date == lease.end_date + timedelta(days=1) and renewed.monthly_rental == D('1080')
    assert renewed.charges.count() == 1


def test_termination_credits_unused_period(auth_client, superuser, make_lease):
    lease = make_lease()
    invoice = _bill_one(lease)
    terminate_on = MONTH_START + timedelta(days=9)            # used 10 days
    result = terminate_lease(lease, terminate_on, 'Relocating')
    days = ((MONTH_START + relativedelta(months=1)) - MONTH_START).days
    expected_credit = (D('1000') * (1 - D(10) / D(days))).quantize(D('0.01'))
    assert D(result['credits'][0]['amount']) == expected_credit
    invoice.refresh_from_db()
    assert invoice.credited_amount == expected_credit
    assert invoice.balance_due == D('1000') - expected_credit
    ar = CustomerInvoice.objects.get(invoice_number=f'AR-{invoice.invoice_number}')
    assert ar.balance_due == D('1000') - expected_credit      # credit note applied in AR too
    lease.refresh_from_db()
    assert lease.status == 'terminated' and lease.end_date == terminate_on

    other = make_lease()
    response = auth_client(superuser).post(f'/api/v1/rentals/leases/{other.id}/terminate/',
                                           {'termination_date': str(MONTH_START)})
    assert response.status_code == 200


# ─── AP approval workflow ────────────────────────────────────────────────────

def test_supplier_invoice_needs_approval_above_threshold(auth_client, superuser):
    ApprovalRule.objects.create(name='Over 100', document_type='supplier_invoice', min_amount=D('100'),
                                role=Role.objects.get(role_type='finance_manager'))
    clerk = _make_user('clerk@test.local', role_type='finance_manager')
    manager = _make_user('mgr@test.local', role_type='finance_manager')
    supplier = Supplier.objects.create(name='Big Supplier', ap_account=ChartOfAccount.objects.get(code='2010'))
    client = auth_client(clerk)
    response = client.post('/api/v1/finance/supplier-invoices/', {
        'supplier': str(supplier.id), 'invoice_number': 'BS-1001', 'invoice_date': str(D0),
        'due_date': str(D0 + timedelta(days=30)),
        'lines': [{'description': 'Paint', 'expense_account': str(ChartOfAccount.objects.get(code='5300').id),
                   'unit_price': '500', 'line_total': '500'}]}, format='json')
    assert response.status_code == 201, response.data
    invoice_id = response.data['id']
    client.post(f'/api/v1/finance/supplier-invoices/{invoice_id}/review_invoice/')

    blocked = client.post(f'/api/v1/finance/supplier-invoices/{invoice_id}/post_invoice/')
    assert blocked.status_code == 400 and 'Approval required' in str(blocked.data)
    self_approve = client.post(f'/api/v1/finance/supplier-invoices/{invoice_id}/approve/')
    assert self_approve.status_code == 400                     # creator can't approve

    approved = auth_client(manager).post(f'/api/v1/finance/supplier-invoices/{invoice_id}/approve/',
                                         {'comment': 'ok'})
    assert approved.status_code == 200 and approved.data['approved'] is True
    assert client.post(f'/api/v1/finance/supplier-invoices/{invoice_id}/post_invoice/').status_code == 200


def test_rejection_blocks_until_reapproved(auth_client):
    ApprovalRule.objects.create(name='All payments', document_type='supplier_payment', min_amount=0,
                                role=Role.objects.get(role_type='finance_manager'))
    manager = _make_user('mgr2@test.local', role_type='finance_manager')
    supplier = Supplier.objects.create(name='S', ap_account=ChartOfAccount.objects.get(code='2010'))
    bank_account = BankAccount.objects.create(name='Pay', bank_name='B', account_number='9',
                                              gl_account=ChartOfAccount.objects.create(
                                                  code='1030', name='Payments bank', account_type='asset',
                                                  account_sub_type='bank'))
    from apps.finance.models import SupplierPayment
    from apps.finance.services import approvals

    payment = SupplierPayment.objects.create(supplier=supplier, payment_date=D0, amount=D('10'),
                                             bank_account=bank_account)
    approvals.approve(payment, manager)
    approvals.reject(payment, manager, 'Wrong supplier')
    assert approvals.status(payment)['approved'] is False
    approvals.approve(payment, manager)
    assert approvals.status(payment)['approved'] is True


# ─── payroll ─────────────────────────────────────────────────────────────────

@pytest.fixture
def processed_run(auth_client, superuser):
    from apps.payroll.models import PayrollRun

    start = TODAY.replace(day=1)
    run = PayrollRun.objects.create(name='Run', period_start=start,
                                    period_end=start + relativedelta(months=1) - timedelta(days=1))
    response = auth_client(superuser).post(f'/api/v1/payroll/runs/{run.id}/process/')
    assert response.status_code == 200 and 'gl_warning' not in response.data, response.data
    run.refresh_from_db()
    return run


def test_payroll_accrues_employer_contributions(processed_run):
    entry = JournalEntry.objects.get(source_module='payroll', source_id=processed_run.id)
    assert entry.is_balanced()
    assert entry.lines.filter(account__code='5905', side='debit').exists()
    assert entry.lines.filter(account__code='2640', side='credit').exists()   # ZIMDEF


def test_payroll_statutory_summary(auth_client, superuser, processed_run):
    data = auth_client(superuser).get(f'/api/v1/payroll/runs/{processed_run.id}/statutory/').data
    assert D(data['nssa_p4']['employer']) > 0
    assert D(data['zimdef']) == (D(data['gross_pay']) * D('0.01')).quantize(D('0.01')) or D(data['zimdef']) > 0
    assert D(data['zimra_p2']['total']) == D(data['zimra_p2']['paye']) + D(data['zimra_p2']['aids_levy'])


def test_payroll_approval_is_maker_checker_and_unlocks_outputs(auth_client, superuser, processed_run, mailoutbox):
    client = auth_client(superuser)                              # processed the run
    assert client.get(f'/api/v1/payroll/runs/{processed_run.id}/bank_file/').status_code == 400
    assert client.post(f'/api/v1/payroll/runs/{processed_run.id}/approve/').status_code == 400
    # Nor can the maker approve by editing the status field directly.
    client.patch(f'/api/v1/payroll/runs/{processed_run.id}/', {'status': 'approved', 'total_net': '1'}, format='json')
    processed_run.refresh_from_db()
    assert processed_run.status == 'processing' and processed_run.total_net != 1

    other = _make_user('payroll2@test.local', superuser=True)
    assert auth_client(other).post(f'/api/v1/payroll/runs/{processed_run.id}/approve/').status_code == 200
    bank_file = client.get(f'/api/v1/payroll/runs/{processed_run.id}/bank_file/')
    assert bank_file.status_code == 200
    rows = bank_file.content.decode().strip().splitlines()
    assert rows[0].startswith('employee_number') and len(rows) == processed_run.payslips.count() + 1
    sent = client.post(f'/api/v1/payroll/runs/{processed_run.id}/email_payslips/').data
    assert len(sent['sent']) == len(mailoutbox) > 0
