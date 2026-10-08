"""
Module settings pages: the option lists each module's forms pick from, and the
fixes found while building them (blank tariff rate, stage pipeline, lost reasons).
"""

import pytest

from apps.crm.models import LostReason, Pipeline, PipelineStage
from apps.documents.models import ComplianceRecord, ComplianceRequirement
from apps.finance.models import ChartOfAccount
from apps.properties.models import Property, PropertyType
from apps.properties.seeds import PROPERTY_TYPES, seed_property_types
from tests.conftest import _make_user

pytestmark = pytest.mark.django_db


# ─── Property types ─────────────────────────────────────────────────────────

def test_property_types_are_seeded_so_a_property_can_be_created():
    seed_property_types()
    seed_property_types()   # idempotent
    codes = set(PropertyType.objects.values_list('code', flat=True))
    assert {code for code, _name, _desc in PROPERTY_TYPES} <= codes


def test_property_types_can_be_added_and_report_their_use(auth_client, superuser):
    client = auth_client(superuser)
    response = client.post('/api/v1/properties/types/', {'name': 'Student housing', 'code': 'STU',
                                                         'description': 'Rooms let to students'}, format='json')
    assert response.status_code == 201, response.data
    ptype = PropertyType.objects.get(code='STU')
    Property.objects.create(name='Res 1', property_type=ptype, address_line1='1 Campus Rd')

    listed = {t['code']: t for t in client.get('/api/v1/properties/types/').data}
    assert listed['STU']['property_count'] == 1 and listed['STU']['description'] == 'Rooms let to students'

    # In use: refused with a readable message instead of a server error.
    response = client.delete(f'/api/v1/properties/types/{ptype.id}/')
    assert response.status_code in (400, 409), response.status_code
    assert PropertyType.objects.filter(pk=ptype.pk).exists()


# ─── Utility tariffs ────────────────────────────────────────────────────────

def test_stepped_tariff_saves_without_a_flat_rate(auth_client, superuser):
    """The settings form leaves a blank rate out; the server keeps its default of 0."""
    response = auth_client(superuser).post('/api/v1/propman/tariffs/', {
        'name': 'Water (stepped)', 'utility': 'water', 'unit_label': 'kl',
        'steps': [{'up_to': '50', 'rate': '1.20'}, {'up_to': None, 'rate': '1.80'}], 'is_active': True,
    }, format='json')
    assert response.status_code == 201, response.data
    assert response.data['rate'] == '0.0000' and len(response.data['steps']) == 2


# ─── CRM ────────────────────────────────────────────────────────────────────

def test_pipeline_stage_is_created_on_its_pipeline_and_filtered_by_it(auth_client, superuser):
    client = auth_client(superuser)
    pipeline = Pipeline.objects.create(name='Lettings', pipeline_type='rental')
    other = Pipeline.objects.create(name='Sales', pipeline_type='sale')
    PipelineStage.objects.create(pipeline=other, name='Offer', stage_type='offer', position=1)

    response = client.post('/api/v1/crm/pipeline-stages/', {
        'pipeline': str(pipeline.id), 'name': 'Viewing', 'stage_type': 'viewing', 'position': 1, 'probability': 30,
    }, format='json')
    assert response.status_code == 201, response.data
    assert PipelineStage.objects.get(pk=response.data['id']).pipeline_id == pipeline.id

    listed = client.get('/api/v1/crm/pipeline-stages/', {'pipeline': str(pipeline.id)}).data
    assert [s['name'] for s in listed] == ['Viewing']


def test_lost_reasons_picker_hides_retired_ones_but_settings_see_them(auth_client, superuser):
    client = auth_client(superuser)
    LostReason.objects.create(name='Went with a competitor')
    LostReason.objects.create(name='Old reason', is_active=False)

    picker = {r['name'] for r in client.get('/api/v1/crm/lost-reasons/').data}
    settings = {r['name'] for r in client.get('/api/v1/crm/lost-reasons/', {'all': '1'}).data}
    assert 'Old reason' not in picker and 'Went with a competitor' in picker
    assert {'Old reason', 'Went with a competitor'} <= settings


# ─── Documents: compliance requirements ─────────────────────────────────────

def test_compliance_requirements_crud_and_in_use_delete_is_refused(auth_client, superuser):
    client = auth_client(superuser)
    response = client.post('/api/v1/documents/compliance-requirements/', {
        'name': 'Proof of residence', 'regulation': 'FICA', 'applies_to': 'contact', 'renewal_period_months': 12,
    }, format='json')
    assert response.status_code == 201, response.data
    requirement = ComplianceRequirement.objects.get(pk=response.data['id'])

    ComplianceRecord.objects.create(requirement=requirement)
    listed = client.get('/api/v1/documents/compliance-requirements/').data
    assert listed[0]['record_count'] == 1

    response = client.delete(f'/api/v1/documents/compliance-requirements/{requirement.id}/')
    assert response.status_code == 400
    assert ComplianceRequirement.objects.filter(pk=requirement.pk).exists()


def test_only_the_documents_module_changes_compliance_requirements(auth_client):
    sales = _make_user('sm@test.local', role_type='sales_manager')
    client = auth_client(sales)
    assert client.get('/api/v1/documents/compliance-requirements/').status_code == 200
    response = client.post('/api/v1/documents/compliance-requirements/', {
        'name': 'X', 'regulation': 'Y', 'applies_to': 'company'}, format='json')
    assert response.status_code == 403


# ─── HR and fixed assets ────────────────────────────────────────────────────

def test_job_positions_can_be_set_up(auth_client, superuser):
    client = auth_client(superuser)
    department = client.post('/api/v1/hr/departments/', {'name': 'Treasury', 'code': 'TRS-T'}, format='json')
    assert department.status_code == 201, department.data
    response = client.post('/api/v1/hr/job-positions/', {
        'name': 'Accountant', 'department': department.data['id'], 'expected_employees': 2}, format='json')
    assert response.status_code == 201, response.data
    assert response.data['department_name'] == 'Treasury'


def test_asset_categories_list_their_account_codes(auth_client, superuser):
    client = auth_client(superuser)
    accounts = {code: ChartOfAccount.objects.get(code=code).id for code in ('1500', '1550', '5500', '4970')
                if ChartOfAccount.objects.filter(code=code).exists()}
    if len(accounts) < 4:
        pytest.skip('Standard chart of accounts not seeded')
    response = client.post('/api/v1/fixed-assets/categories/', {
        'code': 'FURN-S', 'name': 'Furniture', 'asset_cost_account': str(accounts['1500']),
        'accum_depr_account': str(accounts['1550']), 'depr_expense_account': str(accounts['5500']),
        'disposal_gain_loss_account': str(accounts['4970']),
    }, format='json')
    assert response.status_code == 201, response.data
    row = next(c for c in client.get('/api/v1/fixed-assets/categories/').data['results'] if c['code'] == 'FURN-S')
    assert row['asset_cost_account_code'] == '1500' and row['disposal_gain_loss_account_code'] == '4970'
