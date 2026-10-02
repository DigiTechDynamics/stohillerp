"""
Property-management gaps closed against MRI MDA Property Manager: units,
valuations, inspections and deposit damages, multi-owner splits, owner payment
runs, agency fees, utilities, recoveries, escalations, turnover rent, arrears,
debit orders, deposit interest, quotes, planned maintenance, lettings,
signatures, reports, distribution, custom fields, owner and contractor portals.
"""

import csv
import io
from decimal import Decimal as D

import pytest
from dateutil.relativedelta import relativedelta
from django.db.models import Q, Sum
from django.test import override_settings

from apps.core.models import Role
from apps.crm.models import Contact
from apps.finance.models import BankAccount, ChartOfAccount, CustomerInvoice, JournalEntry, JournalLine, Supplier
from apps.properties.models import (
    CustomFieldDefinition, Property, PropertyInspection, PropertyOwnership, PropertyType, PropertyUnit,
)
from apps.propman.models import (
    ArrearsCase, ArrearsStage, CPIIndex, DebitOrderMandate, EscalationStep, MaintenancePlan, MaintenanceQuote, Meter,
    RecoverySchedule, RecoveryShare, TenantApplication, TurnoverReport, UtilityTariff,
)
from apps.propman.services import arrears, collections, maintenance, owner_runs, recoveries, utilities
from apps.rentals.models import Lease, MaintenanceRequest, RentalInvoice, RentalPayment
from apps.rentals.owners import owner_balance
from apps.rentals.services.billing import generate_due_invoices
from tests.conftest import OPEN_PERIOD_DATE, _make_user

pytestmark = pytest.mark.django_db

D0 = OPEN_PERIOD_DATE                 # 2025-06-15, open period
MONTH = D0.replace(day=1)


def _net(code, **filters):
    agg = JournalLine.objects.filter(account__code=code, entry__status__in=JournalEntry.LEDGER_STATUSES, **filters) \
        .aggregate(dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
    return (agg['dr'] or D('0')) - (agg['cr'] or D('0'))


@pytest.fixture
def bank(db):
    account, _ = BankAccount.objects.get_or_create(
        gl_account=ChartOfAccount.objects.get(code='1010'),
        defaults={'name': 'Main', 'bank_name': 'Test Bank', 'account_number': '000111'})
    return account


@pytest.fixture
def owner(db):
    return Contact.objects.create(first_name='Olive', last_name='Owner', email='olive@test.local',
                                  contact_type='landlord', bank_name='CBZ', bank_branch_code='6101',
                                  bank_account_number='12345678', bank_account_name='O Owner')


@pytest.fixture
def make_property(db):
    counter = {'n': 0}

    def make(owner=None, **fields):
        counter['n'] += 1
        return Property.objects.create(
            name=f'Block {counter["n"]}', property_type=PropertyType.objects.first(), address_line1='1 Road',
            ownership_type='managed' if owner else 'owned', owner=owner, management_fee_rate=D('10'), **fields)
    return make


@pytest.fixture
def make_lease(db, bank, make_property):
    counter = {'n': 0}

    def make(prop=None, owner=None, unit=None, **overrides):
        counter['n'] += 1
        n = counter['n']
        tenant = Contact.objects.create(first_name='Tess', last_name=f'Tenant{n}', email=f'tess{n}@test.local',
                                        phone_mobile=f'+26377000{n:04d}', contact_type='tenant')
        fields = dict(property=prop or make_property(owner), unit=unit, tenant=tenant, status='active',
                      start_date=MONTH, monthly_rental=D('1000'), rental_escalation_rate=D('0'), payment_due_days=5)
        fields.update(overrides)
        return Lease.objects.create(**fields)
    return make


def _bill(lease, as_of=MONTH):
    result = generate_due_invoices(as_of, leases=Lease.objects.filter(pk=lease.pk))
    assert not result.errors, result.errors
    return RentalInvoice.objects.filter(lease=lease).order_by('-period_start').first()


# ─── units, valuations, inspections ──────────────────────────────────────────

def test_units_api_and_occupancy_follow_the_lease(auth_client, superuser, make_property, make_lease):
    prop = make_property()
    client = auth_client(superuser)
    response = client.post('/api/v1/properties/units/', {'property': str(prop.pk), 'unit_number': 'A1',
                                                          'unit_type': 'office', 'floor_size': '120'}, format='json')
    assert response.status_code == 201
    unit = PropertyUnit.objects.get(pk=response.data['id'])
    assert unit.status == 'available'
    lease = make_lease(prop=prop, unit=unit)
    unit.refresh_from_db()
    assert unit.status == 'occupied'
    assert client.get(f'/api/v1/properties/units/{unit.pk}/').data['current_lease']['lease_number'] == lease.lease_number
    lease.status = 'terminated'
    lease.save()
    unit.refresh_from_db()
    assert unit.status == 'available'


def test_latest_valuation_becomes_the_current_valuation(auth_client, superuser, make_property):
    prop = make_property()
    client = auth_client(superuser)
    for when, amount in (('2024-01-31', '100000'), ('2025-03-31', '125000')):
        assert client.post('/api/v1/properties/valuations/', {
            'property': str(prop.pk), 'valuation_date': when, 'valuation_amount': amount,
            'valuator_name': 'Val Uer'}, format='json').status_code == 201
    prop.refresh_from_db()
    assert prop.current_valuation == D('125000') and str(prop.last_valuation_date) == '2025-03-31'


def test_outgoing_inspection_damages_are_kept_from_the_deposit(auth_client, superuser, make_lease, owner):
    lease = make_lease(owner=owner, deposit_amount=D('1000'))
    client = auth_client(superuser)
    assert client.post(f'/api/v1/rentals/leases/{lease.pk}/record_deposit/', {'amount': '1000', 'date': str(D0)},
                       format='json').status_code == 200
    created = client.post('/api/v1/properties/inspections/', {
        'property': str(lease.property_id), 'lease': str(lease.pk), 'inspection_type': 'outgoing',
        'scheduled_date': f'{D0}T09:00:00Z'}, format='json')
    inspection = PropertyInspection.objects.get(pk=created.data['id'])
    assert client.post(f'/api/v1/properties/inspections/{inspection.pk}/checklist/').status_code == 200
    item = inspection.items.filter(area='Kitchen').first()
    assert client.patch(f'/api/v1/properties/inspection-items/{item.pk}/', {'condition': 'damaged',
                        'repair_cost': '150.00'}, format='json').status_code == 200
    assert client.post(f'/api/v1/properties/inspections/{inspection.pk}/complete/',
                       {'condition_rating': 6}, format='json').status_code == 200
    assert client.get(f'/api/v1/properties/inspections/{inspection.pk}/report/').content.startswith(b'%PDF')
    funds_before = _net('2210', property_ref=lease.property)

    response = client.post(f'/api/v1/rentals/leases/{lease.pk}/refund_deposit/', {'date': str(D0)}, format='json')
    assert response.status_code == 200, response.data
    assert response.data['applied_to_damages'] == '150.00' and response.data['refunded'] == '850.00'
    # Managed property: the damages go to the owner's trust balance for the repairs.
    assert _net('2210', property_ref=lease.property) - funds_before == D('-150.00')


# ─── owners ──────────────────────────────────────────────────────────────────

def test_multi_owner_shares_split_owner_funds(make_lease, owner):
    second = Contact.objects.create(first_name='Sam', last_name='Second', email='sam@test.local')
    lease = make_lease(owner=owner)
    PropertyOwnership.objects.create(property=lease.property, owner=owner, share_percent=D('60'))
    PropertyOwnership.objects.create(property=lease.property, owner=second, share_percent=D('40'))
    _bill(lease)
    # Rent 1000 less 10% fee = 900 held for the owners.
    assert owner_balance(owner) == D('540.00')
    assert owner_balance(second) == D('360.00')


def test_owner_payment_run_pays_collected_balances_and_writes_a_bank_file(auth_client, superuser, make_lease, owner,
                                                                          bank):
    lease = make_lease(owner=owner)
    invoice = _bill(lease)
    RentalPayment.objects.create(invoice=invoice, payment_date=D0, amount=invoice.total_amount,
                                 payment_method='eft', reference='EFT-1')
    client = auth_client(superuser)
    preview = client.get('/api/v1/propman/owner-payment-runs/preview/').data['owners']
    assert any(r['owner'] == str(owner.pk) and r['amount'] == '900.00' for r in preview)
    response = client.post('/api/v1/propman/owner-payment-runs/', {'bank_account': str(bank.pk), 'run_date': str(D0),
                                                                   'owners': [str(owner.pk)]}, format='json')
    assert response.status_code == 201, response.data
    assert owner_balance(owner) == D('0.00')
    rows = list(csv.reader(io.StringIO(client.get(f'/api/v1/propman/owner-payment-runs/{response.data["id"]}/file/')
                                       .content.decode())))
    assert rows[1][:5] == ['O Owner', 'CBZ', '6101', '12345678', '900.00']


def test_letting_fee_is_charged_to_the_owner_once(make_property, make_lease, owner):
    prop = make_property(owner, letting_fee_percent=D('50'))
    lease = make_lease(prop=prop)
    lease.refresh_from_db()
    assert lease.letting_fee_charged
    assert _net('4300', property_ref=prop) == D('-500.00')
    lease.save()        # saving again does not charge it twice
    assert _net('4300', property_ref=prop) == D('-500.00')


# ─── utilities and recoveries ────────────────────────────────────────────────

def test_stepped_tariff():
    tariff = UtilityTariff(name='Water', utility='water', steps=[{'up_to': 10, 'rate': '1.00'},
                                                                 {'up_to': None, 'rate': '2.50'}])
    assert tariff.charge_for(D('8')) == D('8.00')
    assert tariff.charge_for(D('14')) == D('20.00')        # 10 x 1 + 4 x 2.5


def test_meter_consumption_is_recharged_on_the_rent_invoice(make_property, make_lease):
    prop = make_property()
    unit = PropertyUnit.objects.create(property=prop, unit_number='U1', floor_size=D('50'))
    tariff = UtilityTariff.objects.create(name='Power', utility='electricity', rate=D('0.20'), fixed_monthly=D('5'))
    meter = Meter.objects.create(property=prop, unit=unit, utility='electricity', serial_number='E-1', tariff=tariff)
    utilities.record_reading(meter, MONTH - relativedelta(months=1), D('1000'))
    reading = utilities.record_reading(meter, MONTH, D('1250'))
    assert reading.consumption == D('250')
    from apps.finance.services.accounting import AccountingError
    with pytest.raises(AccountingError):
        utilities.record_reading(meter, MONTH + relativedelta(days=2), D('900'))   # lower than before
    invoice = _bill(make_lease(prop=prop, unit=unit))
    line = next(c for c in invoice.charges if c.get('source') == f'meter:{meter.pk}')
    assert D(line['amount']) == D('55.00')                       # 250 x 0.20 + 5
    reading.refresh_from_db()
    assert reading.billed_invoice_id == invoice.pk


def test_area_recoveries_bill_on_account_and_reconcile(make_property, make_lease):
    prop = make_property()
    big = PropertyUnit.objects.create(property=prop, unit_number='B', floor_size=D('300'))
    small = PropertyUnit.objects.create(property=prop, unit_number='S', floor_size=D('100'))
    schedule = RecoverySchedule.objects.create(property=prop, name='Operating costs', annual_budget=D('12000'),
                                               year_start=MONTH)
    schedule.expense_accounts.add(ChartOfAccount.objects.get(code='5300'))
    lease_big, lease_small = make_lease(prop=prop, unit=big), make_lease(prop=prop, unit=small)
    RecoveryShare.objects.create(schedule=schedule, lease=lease_big)
    RecoveryShare.objects.create(schedule=schedule, lease=lease_small)
    invoice = _bill(lease_big)
    line = next(c for c in invoice.charges if c.get('source') == f'recovery:{schedule.pk}')
    assert D(line['amount']) == D('750.00')          # 12000 / 12 x 75%
    _bill(lease_small)

    # Actual repairs on the property for the month: 1200 (above the 1000 billed on account).
    from apps.finance.services.accounting import AccountingService, PostingData
    posting = PostingData(description='Repairs', entry_date=D0, source_module='test')
    posting.add_debit('5300', D('1200'), 'Repairs', property_ref=prop)
    posting.add_credit('1010', D('1200'), 'Paid')
    AccountingService().post_entry(posting)

    rec = recoveries.reconcile(schedule, MONTH, MONTH + relativedelta(months=1, days=-1), post=True)
    by_lease = {line['lease_number']: line for line in rec.lines}
    assert D(by_lease[lease_big.lease_number]['difference']) == D('150.00')    # 900 due - 750 billed
    assert D(by_lease[lease_small.lease_number]['difference']) == D('50.00')
    assert CustomerInvoice.objects.filter(invoice_number=by_lease[lease_big.lease_number]['document'],
                                          total_amount=D('150.00')).exists()


# ─── lease terms ─────────────────────────────────────────────────────────────

def test_stepped_escalation_applies_on_its_date(make_lease):
    lease = make_lease(escalation_type='stepped', start_date=MONTH - relativedelta(months=2))
    EscalationStep.objects.create(lease=lease, effective_date=MONTH - relativedelta(months=1), new_rent=D('1100'))
    EscalationStep.objects.create(lease=lease, effective_date=MONTH, percent=D('10'))
    invoice = _bill(lease)
    assert invoice.rental_amount == D('1210.00')


def test_cpi_escalation_uses_cpi_growth_plus_margin(make_lease):
    lease = make_lease(escalation_type='cpi', cpi_margin=D('1'), start_date=MONTH - relativedelta(years=1))
    CPIIndex.objects.create(month=MONTH - relativedelta(years=1, months=1), value=D('100'))
    CPIIndex.objects.create(month=MONTH - relativedelta(months=1), value=D('105'))
    lease.next_invoice_date = MONTH
    lease.save(update_fields=['next_invoice_date'])
    invoice = _bill(lease)
    assert invoice.rental_amount == D('1060.00')       # 5% CPI + 1% margin


def test_turnover_rent_above_base_rent(make_lease):
    lease = make_lease(turnover_rent_percent=D('8'), start_date=MONTH - relativedelta(months=1))
    TurnoverReport.objects.create(lease=lease, month=MONTH - relativedelta(months=1), turnover=D('20000'))
    lease.next_invoice_date = MONTH
    lease.save(update_fields=['next_invoice_date'])
    invoice = _bill(lease)
    line = next(c for c in invoice.charges if c.get('source', '').startswith('turnover:'))
    assert D(line['amount']) == D('600.00')            # 8% of 20000 = 1600 - 1000 base


# ─── arrears, collections, deposits ──────────────────────────────────────────

def test_arrears_cases_escalate_send_messages_and_settle(make_lease, mailoutbox):
    from apps.propman.seeds import seed_arrears_stages
    seed_arrears_stages()
    lease = make_lease()
    invoice = _bill(lease)
    today = invoice.due_date + relativedelta(days=20)
    assert '1 case(s) opened, 1 escalated' in arrears.run_arrears(today)
    case = ArrearsCase.objects.get(lease=lease)
    assert case.stage.action == 'letter'          # 20 days: straight to the letter of demand
    assert any('Letter of demand' in m.subject for m in mailoutbox)
    assert case.actions.first().messages.filter(channel='sms', status='logged').exists()

    arrears.record_promise(case, today + relativedelta(days=15), D('500'))
    arrears.run_arrears(today + relativedelta(days=12))     # final demand age reached, but the promise holds
    case.refresh_from_db()
    assert case.status == 'promise' and case.stage.action == 'letter'

    RentalPayment.objects.create(invoice=invoice, payment_date=D0, amount=invoice.balance_due,
                                 payment_method='eft', reference='PAID')
    arrears.run_arrears(today + relativedelta(days=1))
    case.refresh_from_db()
    assert case.status == 'settled'


def test_debit_order_batch_receipts_paid_items(auth_client, superuser, make_lease, bank, mailoutbox):
    paid_lease, bounced_lease = make_lease(), make_lease()
    for lease, ref in ((paid_lease, 'DO-1'), (bounced_lease, 'DO-2')):
        _bill(lease)
        DebitOrderMandate.objects.create(lease=lease, reference=ref, account_holder='T', bank_name='CBZ',
                                         branch_code='1', account_number='9', collection_day=D0.day, signed_on=MONTH)
    client = auth_client(superuser)
    batch = client.post('/api/v1/propman/debit-batches/', {'collection_date': str(D0), 'bank_account': str(bank.pk)},
                        format='json').data
    assert D(batch['total']) == D('2000.00')
    assert b'DO-1' in client.get(f'/api/v1/propman/debit-batches/{batch["id"]}/file/').content
    items = {i['mandate_reference']: i['id'] for i in batch['items']}
    response = client.post(f'/api/v1/propman/debit-batches/{batch["id"]}/results/', {'results': [
        {'item': items['DO-1'], 'status': 'paid'}, {'item': items['DO-2'], 'status': 'unpaid', 'reason': 'NSF'}]},
        format='json')
    assert response.data['paid'] == 1 and response.data['unpaid'] == 1 and response.data['status'] == 'processed'
    assert not RentalInvoice.objects.filter(lease=paid_lease, balance_due__gt=0).exists()
    assert RentalInvoice.objects.filter(lease=bounced_lease, balance_due__gt=0).exists()
    assert any('unpaid' in m.subject.lower() for m in mailoutbox)


@override_settings(DEPOSIT_INTEREST_RATE=6.0)
def test_deposit_interest_is_credited_once_a_month(make_lease):
    from apps.finance.services.accounting import AccountingService
    lease = make_lease(deposit_amount=D('1200'))
    AccountingService().post_deposit_received(lease, D('1200'), D0)
    Lease.objects.filter(pk=lease.pk).update(deposit_paid=True)
    month_end = MONTH + relativedelta(months=1, days=-1)
    assert collections.credit_deposit_interest(month_end) != '0 deposit(s) credited'
    assert collections.credit_deposit_interest(month_end) == '0 deposit(s) credited'     # once a month
    lease.refresh_from_db()
    assert lease.deposit_amount == D('1206.00')


# ─── maintenance ─────────────────────────────────────────────────────────────

@override_settings(MAINTENANCE_OWNER_APPROVAL_LIMIT=500)
def test_large_quote_waits_for_the_owner_then_raises_a_po(api_client, make_lease, owner):
    lease = make_lease(owner=owner)
    job = MaintenanceRequest.objects.create(property=lease.property, lease=lease, category='Roof', description='Leak')
    supplier = Supplier.objects.create(name='Roofers', ap_account=ChartOfAccount.objects.get(code='2010'))
    quote = MaintenanceQuote.objects.create(request=job, supplier=supplier, amount=D('800'))
    assert maintenance.accept_quote(quote).status == 'awaiting_owner'

    owner_user = _make_user('olive.portal@test.local')
    owner_user.contact = owner
    owner_user.save()
    owner_user.roles.add(Role.objects.get(role_type='owner'))
    api_client.force_authenticate(owner_user)
    assert api_client.get('/api/v1/owner-portal/quotes/').data[0]['amount'] == '800.00'
    assert api_client.get('/api/v1/rentals/leases/').status_code == 403       # fenced into the owner portal
    response = api_client.post(f'/api/v1/owner-portal/quotes/{quote.pk}/decide/', {'approve': True}, format='json')
    assert response.data['status'] == 'accepted'
    quote.refresh_from_db()
    job.refresh_from_db()
    assert quote.purchase_order is not None and job.contractor == supplier


def test_planned_maintenance_raises_jobs(make_property):
    prop = make_property()
    plan = MaintenancePlan.objects.create(property=prop, title='Lift service', frequency_months=3,
                                          next_due=D0 + relativedelta(days=7), lead_days=14)
    assert maintenance.raise_planned_jobs(D0) == '1 planned job(s) raised'
    plan.refresh_from_db()
    assert plan.next_due == D0 + relativedelta(days=7, months=3)
    assert MaintenanceRequest.objects.filter(property=prop, description__startswith='Planned: Lift service').exists()


def test_contractor_portal_jobs_and_quotes(api_client, make_property):
    supplier = Supplier.objects.create(name='Fixit', email='fixit@test.local',
                                       ap_account=ChartOfAccount.objects.get(code='2010'))
    prop = make_property()
    mine = MaintenanceRequest.objects.create(property=prop, category='Plumbing', description='Tap', contractor=supplier)
    open_job = MaintenanceRequest.objects.create(property=prop, category='Paint', description='Walls')
    user = _make_user('fixit.portal@test.local')
    user.supplier = supplier
    user.save()
    user.roles.add(Role.objects.get(role_type='contractor'))
    api_client.force_authenticate(user)
    assert [j['reference'] for j in api_client.get('/api/v1/contractor-portal/jobs/').data] == [mine.reference]
    assert api_client.patch(f'/api/v1/contractor-portal/jobs/{mine.reference}/', {'status': 'in_progress',
                            'notes': 'On site'}, format='json').data['status'] == 'in_progress'
    assert api_client.post('/api/v1/contractor-portal/quotes/', {'job': open_job.reference, 'amount': '250'},
                           format='json').status_code == 201
    assert api_client.get('/api/v1/properties/').status_code == 403


# ─── lettings, signatures ────────────────────────────────────────────────────

def test_application_to_draft_lease(auth_client, superuser, make_property):
    prop = make_property()
    unit = PropertyUnit.objects.create(property=prop, unit_number='7', monthly_rental=D('900'))
    applicant = Contact.objects.create(first_name='App', last_name='Licant', email='app@test.local')
    client = auth_client(superuser)
    app = client.post('/api/v1/propman/applications/', {'property': str(prop.pk), 'unit': str(unit.pk),
                      'applicant': str(applicant.pk), 'monthly_income': '3000'}, format='json').data
    assert app['rent_to_income'] == '30.0'
    base = f'/api/v1/propman/applications/{app["id"]}'
    assert client.post(f'{base}/credit_check/').data['credit_status'] == 'pending'
    assert client.post(f'{base}/credit_result/', {'status': 'clear', 'score': 710}, format='json').data['credit_status'] == 'clear'
    assert client.post(f'{base}/convert/', {'start_date': str(MONTH)}, format='json').status_code == 400   # not approved
    client.post(f'{base}/approve/')
    converted = client.post(f'{base}/convert/', {'start_date': str(MONTH)}, format='json')
    assert converted.status_code == 201
    lease = Lease.objects.get(pk=converted.data['lease'])
    unit.refresh_from_db()
    assert lease.status == 'draft' and lease.monthly_rental == D('900') and unit.status == 'reserved'
    assert TenantApplication.objects.get(pk=app['id']).status == 'converted'

    sent = client.post(f'/api/v1/rentals/leases/{lease.pk}/send_for_signature/')
    assert sent.data == {'signature_status': 'sent', 'status': 'pending_signature'}
    assert client.post(f'/api/v1/rentals/leases/{lease.pk}/mark_signed/').data['signature_status'] == 'signed'


# ─── reports, distribution, custom fields ────────────────────────────────────

def test_property_reports(auth_client, superuser, make_property, make_lease):
    prop = make_property()
    unit = PropertyUnit.objects.create(property=prop, unit_number='R1', floor_size=D('100'))
    PropertyUnit.objects.create(property=prop, unit_number='R2', floor_size=D('80'), monthly_rental=D('700'))
    from django.utils import timezone
    lease = make_lease(prop=prop, unit=unit, end_date=timezone.localdate() + relativedelta(months=2))
    _bill(lease)
    client = auth_client(superuser)
    params = {'property': str(prop.pk)}
    roll = client.get('/api/v1/propman/reports/rent_roll/', params).data
    assert roll['rows'][0]['rent_per_m2'] == '10.00'
    assert client.get('/api/v1/propman/reports/vacancy/', params).data['rows'][0]['unit'] == 'R2'
    assert client.get('/api/v1/propman/reports/lease_expiry/', params).data['totals']['leases'] == 1
    assert client.get('/api/v1/propman/reports/arrears/', params).status_code == 200
    income = client.get('/api/v1/propman/reports/property_income/', {**params, 'from_date': str(MONTH),
                                                                        'to_date': str(D0)}).data
    assert D(income['rows'][0]['revenue']) == D('1000.00')
    csv_response = client.get('/api/v1/propman/reports/rent_roll/', {**params, 'export_format': 'csv'})
    assert csv_response['Content-Type'] == 'text/csv' and b'Rent/m' in csv_response.content
    assert client.get('/api/v1/propman/reports/nope/').status_code == 400


def test_bulk_message_reaches_tenants_by_email_and_logged_sms(auth_client, superuser, make_property, make_lease,
                                                              mailoutbox):
    prop = make_property()
    make_lease(prop=prop)
    make_lease(prop=prop)
    response = auth_client(superuser).post('/api/v1/propman/distribution/message/', {
        'audience': 'tenants', 'property': str(prop.pk), 'subject': 'Water off', 'body': 'Tuesday 9-12',
        'channels': ['email', 'sms']}, format='json')
    assert response.data['recipients'] == 2
    assert response.data['by_status'] == {'sent': 2, 'logged': 2}
    assert len([m for m in mailoutbox if m.subject == 'Water off']) == 2


def test_custom_fields_are_validated(auth_client, superuser, make_property):
    CustomFieldDefinition.objects.create(entity='property', key='erf_number', label='Erf number', required=True)
    CustomFieldDefinition.objects.create(entity='property', key='zoning', label='Zoning', field_type='choice',
                                         choices=['residential', 'commercial'])
    prop = make_property()
    client = auth_client(superuser)
    url = f'/api/v1/properties/{prop.pk}/'
    assert client.patch(url, {'custom_fields': {'zoning': 'residential'}}, format='json').status_code == 400
    assert client.patch(url, {'custom_fields': {'erf_number': '123', 'zoning': 'farm'}}, format='json').status_code == 400
    assert client.patch(url, {'custom_fields': {'erf_number': '123', 'oops': 1}}, format='json').status_code == 400
    ok = client.patch(url, {'custom_fields': {'erf_number': '123', 'zoning': 'commercial'}}, format='json')
    assert ok.status_code == 200 and ok.data['custom_fields'] == {'erf_number': '123', 'zoning': 'commercial'}


def test_lease_custom_fields_and_property_filter(auth_client, superuser, make_property, make_lease):
    CustomFieldDefinition.objects.create(entity='lease', key='trading_name', label='Trading name')
    lease = make_lease()
    make_lease()                                # on another property
    client = auth_client(superuser)
    listed = client.get('/api/v1/rentals/leases/', {'property': lease.property_id}).data['results']
    assert [row['id'] for row in listed] == [str(lease.pk)]
    url = f'/api/v1/rentals/leases/{lease.pk}/'
    assert client.patch(url, {'custom_fields': {'unknown': 'x'}}, format='json').status_code == 400
    ok = client.patch(url, {'custom_fields': {'trading_name': 'Shop 1'}}, format='json')
    assert ok.status_code == 200 and ok.data['custom_fields'] == {'trading_name': 'Shop 1'}


def test_arrears_stages_are_seeded():
    from apps.propman.seeds import seed_arrears_stages
    seed_arrears_stages()
    assert list(ArrearsStage.objects.values_list('action', flat=True)) == ['reminder', 'letter', 'final', 'legal']
