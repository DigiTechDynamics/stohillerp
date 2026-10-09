"""
Leave balances under Zimbabwe's Labour Act [Chapter 28:01]: annual leave builds
up at a day per 17 days worked (to at most 90), 90 sick days a service year, 12
special leave days a calendar year, 98 maternity days after a year's service.
Applying holds the days; approving deducts them; rejecting gives them back.
"""

from datetime import date
from decimal import Decimal

import pytest

from apps.hr.leave import balance_for, leave_balances
from apps.hr.models import Employee, LeaveAllocation, LeaveRequest

pytestmark = pytest.mark.django_db

ON = date(2026, 10, 12)          # a Monday


def _employee(first='Lee', start=date(2025, 10, 12), **extra):
    return Employee.objects.create(first_name=first, last_name='Staff', email=f'{first.lower()}@test.local',
                                   start_date=start, **extra)


def _row(employee, leave_type, on=ON):
    return balance_for(employee, leave_type, on=on)


def test_statutory_entitlements():
    lee = _employee()                                       # a year and a day by ON: 366 days
    annual = _row(lee, 'annual')
    assert annual['entitled'] == Decimal('21.52') and annual['available'] == Decimal('21.52')   # 366 / 17
    assert _row(lee, 'sick')['entitled'] == 90
    assert _row(lee, 'special')['entitled'] == 12
    assert _row(lee, 'maternity')['entitled'] == 98
    assert _row(lee, 'unpaid')['available'] is None


def test_new_starters_build_up_annual_leave_and_wait_a_year_for_maternity():
    new = _employee('New', start=date(2026, 9, 1))         # 42 days
    assert _row(new, 'annual')['entitled'] == Decimal('2.47')
    maternity = _row(new, 'maternity')
    assert maternity['available'] == 0 and 'year' in maternity['period']


def test_annual_leave_stops_building_up_at_90_days():
    old = _employee('Old', start=date(2018, 1, 1))
    assert _row(old, 'annual')['available'] == 90


def test_agents_get_balances_too():
    agent = _employee('Agent', staff_type='agent', employment_type='commission_only')
    assert _row(agent, 'annual')['entitled'] == Decimal('21.52')


def test_allocations_add_days_on_top():
    lee = _employee()
    LeaveAllocation.objects.create(employee=lee, leave_type='annual', days_allocated=5, description='Carried in')
    assert _row(lee, 'annual')['entitled'] == Decimal('26.52')


def _apply(client, employee, **data):
    body = {'employee': str(employee.id), 'leave_type': 'annual', 'start_date': str(ON), 'days_requested': '5', **data}
    return client.post('/api/v1/hr/leave/', body, format='json')


def test_applying_holds_days_and_approving_deducts_them(auth_client, superuser):
    client, lee = auth_client(superuser), _employee()
    leave = _apply(client, lee).data
    row = _row(lee, 'annual')
    assert (row['pending'], row['taken'], row['available']) == (5, 0, Decimal('16.52'))

    client.patch(f'/api/v1/hr/leave/{leave["id"]}/', {'status': 'approved'}, format='json')
    row = _row(lee, 'annual')
    assert (row['pending'], row['taken'], row['available']) == (0, 5, Decimal('16.52'))


def test_rejected_leave_is_given_back(auth_client, superuser):
    client, lee = auth_client(superuser), _employee()
    leave = _apply(client, lee).data
    client.patch(f'/api/v1/hr/leave/{leave["id"]}/', {'status': 'rejected'}, format='json')
    assert _row(lee, 'annual')['available'] == Decimal('21.52')


def test_cannot_apply_for_more_than_the_balance(auth_client, superuser):
    client, lee = auth_client(superuser), _employee()
    response = _apply(client, lee, leave_type='special', days_requested='13')
    assert response.status_code == 400 and 'only 12 special leave days available' in str(response.data)
    assert _apply(client, lee, leave_type='unpaid', days_requested='30').status_code == 201


def test_sick_leave_resets_each_service_year():
    lee = _employee()
    LeaveRequest.objects.create(employee=lee, leave_type='sick', start_date=date(2026, 3, 2),
                                end_date=date(2026, 3, 6), days_requested=5, status='approved')
    assert _row(lee, 'sick', on=date(2026, 9, 1))['available'] == 85     # service year 12 Oct 2025 – 11 Oct 2026
    fresh = _row(lee, 'sick')                                              # ON is the first anniversary
    assert fresh['available'] == 90 and fresh['period'].startswith('Service year 12 Oct 2026')


def test_editing_a_request_does_not_count_itself(auth_client, superuser):
    client, lee = auth_client(superuser), _employee()
    leave = _apply(client, lee, leave_type='special', days_requested='12').data
    response = client.patch(f'/api/v1/hr/leave/{leave["id"]}/', {'days_requested': '11'}, format='json')
    assert response.status_code == 200, response.data


def test_balances_endpoints(auth_client, superuser):
    client, lee = auth_client(superuser), _employee()
    rows = client.get(f'/api/v1/hr/employees/{lee.id}/leave-balances/', {'on': str(ON)}).data
    assert {r['leave_type'] for r in rows} >= {'annual', 'sick', 'special', 'maternity'}
    everyone = client.get('/api/v1/hr/employees/leave-balances/', {'on': str(ON), 'search': 'Lee'}).data
    assert [e['employee_name'] for e in everyone] == ['Lee Staff']
    assert everyone[0]['balances'] == leave_balances(lee, ON)
