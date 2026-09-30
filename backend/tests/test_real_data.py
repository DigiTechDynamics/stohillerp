"""
Figures shown in the UI come from real data: sales and commission stats,
compliance summary, the executive dashboard, and the company profile used on
documents. The test database holds the demo data, so tests assert on the
change their own records make.
"""

from datetime import timedelta
from decimal import Decimal as D

import pytest
from django.test import override_settings
from django.utils import timezone

from apps.commissions.models import CommissionRecord
from apps.core.models import Currency
from apps.crm.models import Contact
from apps.documents.models import ComplianceRecord, ComplianceRequirement
from apps.finance.models import ExchangeRate
from apps.hr.models import Employee
from apps.properties.models import Property, PropertyType
from apps.sales.models import SaleTransaction

pytestmark = pytest.mark.django_db
TODAY = timezone.localdate()


def _sale(ref, price, status='registered', on=TODAY, currency=None, commission=None):
    prop = Property.objects.create(name=f'House {ref}', property_type=PropertyType.objects.first(), address_line1='1 Rd')
    buyer = Contact.objects.create(first_name='Buyer', last_name=ref, email=f'{ref.lower()}@test.local')
    return SaleTransaction.objects.create(sale_reference=ref, property=prop, buyer=buyer, sale_price=D(price),
                                          commission_amount=commission, offer_date=on, transfer_date=on,
                                          status=status, currency=currency)


def _employee(number, first='Tariro', last='Agent'):
    return Employee.objects.create(employee_number=number, first_name=first, last_name=last,
                                   email=f'{number.lower()}@test.local', start_date=TODAY)


def test_sales_stats_are_computed_in_base_currency(auth_client, superuser):
    client = auth_client(superuser)
    before = client.get('/api/v1/sales/transactions/stats/').data
    zwg = Currency.objects.get(code='ZWG')
    ExchangeRate.objects.update_or_create(currency=zwg, effective_date=TODAY - timedelta(days=1),
                                          defaults={'rate': D('0.0400000000')})
    _sale('RD-1', '100000', commission=D('5000'))
    _sale('RD-2', '1000000', currency=zwg)                  # 1,000,000 ZWG = 40,000 base
    _sale('RD-3', '250000', status='transfer')               # active, pending completion
    after = client.get('/api/v1/sales/transactions/stats/').data

    assert after['ytd_count'] - before['ytd_count'] == 2
    assert D(after['ytd_value']) - D(before['ytd_value']) == D('140000.00')
    assert D(after['ytd_commission']) - D(before['ytd_commission']) == D('5000.00')
    assert after['completed_mtd_count'] - before['completed_mtd_count'] == 2
    assert after['active_count'] - before['active_count'] == 1
    assert D(after['pending_completion_value']) - D(before['pending_completion_value']) == D('250000.00')
    assert after['currency'] == Currency.objects.get(is_base=True).code


def test_sales_stats_flag_missing_exchange_rates(auth_client, superuser):
    currency = Currency.objects.create(code='XTS', name='Test currency', symbol='T')
    _sale('RD-4', '500', currency=currency)
    data = auth_client(superuser).get('/api/v1/sales/transactions/stats/').data
    assert 'XTS' in data['missing_rates']


def test_commission_stats(auth_client, superuser):
    client = auth_client(superuser)
    before = client.get('/api/v1/commissions/records/stats/').data
    agent = _employee('EMP-RD1', 'Nyasha', 'Moyo')
    prop = Property.objects.create(name='Commission house', property_type=PropertyType.objects.first(), address_line1='2 Rd')
    common = dict(agent=agent, property=prop, transaction_type='sale', transaction_amount=D('100000'),
                  company_commission_rate=D('5'), company_commission_amount=D('5000'),
                  agent_split_rate=D('50'), gross_commission=D('2500'))
    CommissionRecord.objects.create(reference='COM-RD1', net_commission=D('900000'), status='paid',
                                    payment_date=TODAY, **common)
    CommissionRecord.objects.create(reference='COM-RD2', net_commission=D('300'), status='pending', **common)
    after = client.get('/api/v1/commissions/records/stats/').data

    assert D(after['paid_ytd']) - D(before['paid_ytd']) == D('900000')
    assert D(after['pending_approval']) - D(before['pending_approval']) == D('300')
    assert after['top_earner_mtd']['name'] == 'Nyasha Moyo'      # the biggest earner this month


def test_compliance_endpoint_is_reachable_and_scored(auth_client, superuser):
    """'compliance/' used to be swallowed by the document detail route."""
    requirement = ComplianceRequirement.objects.create(name='KYC (RD test)', regulation='FICA', applies_to='contact')
    people = [Contact.objects.create(first_name=f'P{i}', last_name='Test', email=f'p{i}@test.local') for i in range(4)]
    ComplianceRecord.objects.create(requirement=requirement, contact=people[0], status='compliant')
    ComplianceRecord.objects.create(requirement=requirement, contact=people[1], status='compliant',
                                    expiry_date=TODAY - timedelta(days=1))         # lapsed -> expired
    ComplianceRecord.objects.create(requirement=requirement, contact=people[2], status='compliant',
                                    expiry_date=TODAY + timedelta(days=10))        # still valid, expiring
    ComplianceRecord.objects.create(requirement=requirement, contact=people[3], status='exempt')
    client = auth_client(superuser)

    assert client.get('/api/v1/documents/compliance/').status_code == 200
    data = client.get('/api/v1/documents/compliance/summary/').data
    row = next(r for r in data['requirements'] if r['requirement'] == 'KYC (RD test)')
    assert (row['compliant'], row['expiring'], row['expired'], row['exempt']) == (1, 1, 1, 1)
    assert row['score'] == 67                               # 2 valid of 3 that apply
    assert any(a['requirement'] == 'KYC (RD test)' and a['status'] == 'expired' for a in data['attention'])


def test_dashboard_has_no_invented_trends(auth_client, superuser):
    data = auth_client(superuser).get('/api/v1/dashboard/executive/').data
    assert data['currency']
    for value in data['trends'].values():
        assert value is None or isinstance(value, float)


@override_settings(COMPANY_CONFIG={
    'name': 'Acme Realty', 'currency': 'USD', 'currency_symbol': '$', 'country': 'ZW', 'tagline': 'Homes',
    'address': '5 Test Road, Harare', 'phone': '+263 24 000', 'email': 'accounts@acme.test', 'website': '',
    'vat_number': 'VAT-123', 'tax_number': '', 'fiscal_year_start_month': 3, 'vat_rate': 0.155,
})
def test_company_profile_drives_documents(auth_client, superuser):
    from apps.core.company import contact_line, tax_line

    data = auth_client(superuser).get('/api/v1/core/company/').data
    assert data['name'] == 'Acme Realty' and data['vat_number'] == 'VAT-123'
    assert contact_line(data) == '5 Test Road, Harare  |  +263 24 000  |  accounts@acme.test'
    assert tax_line(data) == 'VAT No: VAT-123'

    from apps.finance.services.pdf_service import generate_account_statement_pdf
    pdf = generate_account_statement_pdf({'party': {'name': 'X', 'reference': 'X'}, 'from_date': str(TODAY),
                                          'to_date': str(TODAY), 'opening_balance': '0', 'lines': [],
                                          'closing_balance': '0', 'aging': {}})
    assert pdf.startswith(b'%PDF')
