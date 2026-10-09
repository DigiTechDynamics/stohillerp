"""
UAT round 4: VAT on lease rent, property/unit status following leases, and
forgiving validation of stepped utility tariffs.
"""

from decimal import Decimal as D

import pytest

from apps.properties.models import Property, PropertyType, PropertyUnit
from apps.propman.services.lettings import mark_signed
from apps.rentals.models import Lease
from tests.conftest import OPEN_PERIOD_DATE
from tests.test_gap_closure import bank_account, lease_factory  # noqa: F401  (fixtures)

pytestmark = pytest.mark.django_db

D0 = OPEN_PERIOD_DATE


def _property(name='Let house'):
    return Property.objects.create(name=name, property_type=PropertyType.objects.first(), address_line1='1 Road')


def _status(obj):
    obj.refresh_from_db()
    return obj.status


# ─── Utility tariff steps ───────────────────────────────────────────────────

TARIFF = {'name': 'Block electricity', 'utility': 'electricity', 'unit_label': 'kWh', 'rate': '0'}


def test_stepped_tariff_saves_from_the_steps_editor(auth_client, superuser):
    steps = [{'up_to': '50', 'rate': '1.20'}, {'up_to': '', 'rate': '1,80'}, {'up_to': '', 'rate': ''}]
    response = auth_client(superuser).post('/api/v1/propman/tariffs/', {**TARIFF, 'steps': steps}, format='json')
    assert response.status_code == 201, response.data
    assert response.data['steps'] == [{'up_to': '50', 'rate': '1.20'}, {'up_to': None, 'rate': '1.80'}]

    from apps.propman.models import UtilityTariff
    assert UtilityTariff.objects.get(pk=response.data['id']).charge_for(D('100')) == D('150.00')   # 50×1.20 + 50×1.80


def test_flat_tariff_without_steps_saves(auth_client, superuser):
    response = auth_client(superuser).post('/api/v1/propman/tariffs/', {**TARIFF, 'rate': '2.5', 'steps': []}, format='json')
    assert response.status_code == 201, response.data


@pytest.mark.parametrize('steps, message', [
    ([{'up_to': '50', 'rate': ''}], 'give the rate'),
    ([{'up_to': '', 'rate': '1'}, {'up_to': '', 'rate': '2'}], 'only the last step'),
    ([{'up_to': '50', 'rate': '1'}, {'up_to': '40', 'rate': '2'}], 'higher than the one before'),
    ([{'up_to': 'fifty', 'rate': '1'}], 'must be numbers'),
])
def test_bad_steps_say_which_step_is_wrong(auth_client, superuser, steps, message):
    response = auth_client(superuser).post('/api/v1/propman/tariffs/', {**TARIFF, 'steps': steps}, format='json')
    assert response.status_code == 400
    assert message in str(response.data['steps'] if 'steps' in response.data else response.data)


# ─── Occupancy ──────────────────────────────────────────────────────────────

def test_whole_property_lease_moves_it_from_available_to_occupied_and_back():
    prop = _property()
    assert _status(prop) == 'available'
    lease = Lease.objects.create(property=prop, status=Lease.LeaseStatus.DRAFT, start_date=D0, monthly_rental=D('500'))
    assert _status(prop) == 'under_contract'          # taken, waiting for signature

    mark_signed(lease, signed=True)
    assert _status(prop) == 'occupied'

    lease.status = Lease.LeaseStatus.TERMINATED
    lease.save()
    assert _status(prop) == 'available'


def test_deleting_a_draft_lease_frees_the_property_and_unit():
    prop = _property()
    unit = PropertyUnit.objects.create(property=prop, unit_number='1')
    lease = Lease.objects.create(property=prop, unit=unit, status=Lease.LeaseStatus.DRAFT, start_date=D0,
                                 monthly_rental=D('500'))
    assert _status(unit) == 'reserved' and _status(prop) == 'under_contract'
    lease.delete()
    assert _status(unit) == 'available' and _status(prop) == 'available'


def test_property_with_units_is_occupied_once_every_unit_is_let():
    prop = _property('Block')
    units = [PropertyUnit.objects.create(property=prop, unit_number=str(n)) for n in (1, 2)]
    Lease.objects.create(property=prop, unit=units[0], status=Lease.LeaseStatus.ACTIVE, start_date=D0, monthly_rental=D('1'))
    assert _status(units[0]) == 'occupied' and _status(prop) == 'available'      # one unit still free
    Lease.objects.create(property=prop, unit=units[1], status=Lease.LeaseStatus.ACTIVE, start_date=D0, monthly_rental=D('1'))
    assert _status(prop) == 'occupied'


def test_hand_set_statuses_are_kept():
    prop = _property()
    prop.status = Property.PropertyStatus.MAINTENANCE
    prop.save()
    Lease.objects.create(property=prop, status=Lease.LeaseStatus.ACTIVE, start_date=D0, monthly_rental=D('1'))
    assert _status(prop) == 'maintenance'


# ─── VAT on rent ────────────────────────────────────────────────────────────

def test_vat_rate_is_published_for_the_lease_form(auth_client, superuser, settings):
    settings.COMPANY_CONFIG = {**settings.COMPANY_CONFIG, 'vat_rate': 0.155}
    assert auth_client(superuser).get('/api/v1/core/company/').data['vat_rate'] == '15.50'


def test_vat_can_be_switched_on_for_a_lease_and_is_billed(auth_client, superuser, lease_factory, settings):
    from apps.rentals.services.billing import generate_due_invoices

    settings.COMPANY_CONFIG = {**settings.COMPANY_CONFIG, 'vat_rate': 0.155}
    lease = lease_factory(status=Lease.LeaseStatus.ACTIVE)
    response = auth_client(superuser).patch(f'/api/v1/rentals/leases/{lease.id}/', {'vat_applicable': True}, format='json')
    assert response.status_code == 200 and response.data['vat_applicable'] is True

    lease.refresh_from_db()
    generate_due_invoices(D0, leases=Lease.objects.filter(pk=lease.pk))
    invoice = lease.invoices.order_by('created_at').first()
    assert invoice.vat_amount == (invoice.rental_amount * D('0.155')).quantize(D('0.01')) > 0


def test_lease_created_from_an_application_can_carry_vat(auth_client, superuser):
    from apps.crm.models import Contact
    from apps.propman.models import TenantApplication

    applicant = Contact.objects.create(first_name='Shop', last_name='Owner')
    app = TenantApplication.objects.create(applicant=applicant, property=_property('Shop'), offered_rent=D('900'),
                                           status=TenantApplication.Status.APPROVED)
    response = auth_client(superuser).post(f'/api/v1/propman/applications/{app.id}/convert/',
                                           {'start_date': str(D0), 'vat_applicable': True}, format='json')
    assert response.status_code == 201, response.data
    assert Lease.objects.get(pk=response.data['lease']).vat_applicable is True
