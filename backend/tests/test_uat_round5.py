"""
UAT round 5 (HR): department managers need a manager profile and reporting lines
follow the department; company employees vs agents; leave requests driven by
the start date and days applied.
"""

from datetime import date

import pytest

from apps.hr.leave import end_date_for, working_days
from apps.hr.models import Department, Employee, LeaveAllocation, LeaveRequest

pytestmark = pytest.mark.django_db

MONDAY = date(2026, 10, 12)


def _employee(first, **extra):
    return Employee.objects.create(first_name=first, last_name='Staff', email=f'{first.lower()}@test.local',
                                   start_date=date(2025, 1, 1), **extra)


# ─── Managers and reporting lines ───────────────────────────────────────────

def test_department_manager_must_have_a_manager_profile(auth_client, superuser):
    client = auth_client(superuser)
    plain, boss = _employee('Plain'), _employee('Boss', is_manager=True)
    response = client.post('/api/v1/hr/departments/', {'name': 'Leasing', 'code': 'LSG-T', 'manager': str(plain.id)},
                           format='json')
    assert response.status_code == 400 and 'manager profile' in str(response.data)
    response = client.post('/api/v1/hr/departments/', {'name': 'Leasing', 'code': 'LSG-T', 'manager': str(boss.id)},
                           format='json')
    assert response.status_code == 201, response.data
    assert {e['id'] for e in client.get('/api/v1/hr/employees/', {'is_manager': 'true'}).data['results']} >= {str(boss.id)}
    assert str(plain.id) not in {e['id'] for e in client.get('/api/v1/hr/employees/', {'is_manager': 'true'}).data['results']}


def test_staff_report_to_their_departments_manager(auth_client, superuser):
    client = auth_client(superuser)
    boss, other_boss = _employee('Boss', is_manager=True), _employee('Other', is_manager=True)
    dept = Department.objects.create(name='Sales T', code='SLS-T', manager=boss)
    response = client.post('/api/v1/hr/employees/', {
        'first_name': 'New', 'last_name': 'Hire', 'email': 'new@test.local', 'start_date': '2026-01-05',
        'department': str(dept.id), 'reports_to': str(other_boss.id)}, format='json')
    assert response.status_code == 201, response.data
    assert response.data['reports_to'] == boss.id and response.data['manager_name'] == boss.full_name   # not the pick

    # Changing the department's manager moves everyone's reporting line; the manager is left alone.
    client.patch(f'/api/v1/hr/departments/{dept.id}/', {'manager': str(other_boss.id)}, format='json')
    assert Employee.objects.get(pk=response.data['id']).reports_to == other_boss
    boss.refresh_from_db()
    assert boss.reports_to is None or boss.reports_to != boss


def test_a_departments_manager_keeps_their_profile(auth_client, superuser):
    boss = _employee('Boss', is_manager=True)
    Department.objects.create(name='Ops T', code='OPS-T', manager=boss)
    response = auth_client(superuser).patch(f'/api/v1/hr/employees/{boss.id}/', {'is_manager': False}, format='json')
    assert response.status_code == 400 and 'Ops T' in str(response.data)


# ─── Employees vs agents ────────────────────────────────────────────────────

def test_agents_and_company_employees_are_told_apart(auth_client, superuser):
    client = auth_client(superuser)
    _employee('Clerk')
    _employee('Seller', staff_type='agent', employment_type='commission_only')
    agents = client.get('/api/v1/hr/employees/', {'staff_type': 'agent', 'page_size': 200}).data['results']
    assert 'Seller' in {a['first_name'] for a in agents} and 'Clerk' not in {a['first_name'] for a in agents}
    assert {a['staff_type_display'] for a in agents} == {'Agent'}
    staff = client.get('/api/v1/hr/employees/', {'staff_type': 'employee'}).data['results']
    assert 'Clerk' in {e['first_name'] for e in staff} and 'Seller' not in {e['first_name'] for e in staff}


# ─── Leave ──────────────────────────────────────────────────────────────────

def test_working_day_helpers():
    assert end_date_for(MONDAY, 5) == date(2026, 10, 16)        # Mon-Fri
    assert end_date_for(MONDAY, 6) == date(2026, 10, 19)        # skips the weekend
    assert end_date_for(MONDAY, 2.5) == date(2026, 10, 14)      # half day ends on Wednesday
    assert working_days(date(2026, 10, 16), date(2026, 10, 19)) == 2


def _leave(client, employee, **data):
    body = {'employee': str(employee.id), 'leave_type': 'annual', 'start_date': str(MONDAY), 'days_requested': '3', **data}
    return client.post('/api/v1/hr/leave/', body, format='json')


def test_end_date_defaults_from_start_and_days(auth_client, superuser):
    response = _leave(auth_client(superuser), _employee('Lee'), days_requested='6')
    assert response.status_code == 201, response.data
    assert response.data['end_date'] == '2026-10-19'


def test_end_date_must_match_the_days_applied(auth_client, superuser):
    client = auth_client(superuser)
    response = _leave(client, _employee('Lee'), end_date='2026-10-20')       # 7 working days for 3 applied
    assert response.status_code == 400 and 'end on Wed 14 Oct 2026' in str(response.data)


@pytest.mark.parametrize('data, message', [
    ({'days_requested': '0'}, 'number of days'),
    ({'days_requested': '1.3'}, 'whole or half days'),
    ({'start_date': '2026-10-17'}, 'working day'),                               # a Saturday
])
def test_bad_leave_requests_are_explained(auth_client, superuser, data, message):
    response = _leave(auth_client(superuser), _employee('Lee'), **data)
    assert response.status_code == 400 and message in str(response.data)


def test_overlapping_leave_is_refused(auth_client, superuser):
    client, lee = auth_client(superuser), _employee('Lee')
    assert _leave(client, lee).status_code == 201
    response = _leave(client, lee, start_date='2026-10-14', days_requested='1')
    assert response.status_code == 400 and 'already has pending leave' in str(response.data)


def test_leave_cannot_exceed_the_allocation(auth_client, superuser):
    client, lee = auth_client(superuser), _employee('Lee')
    LeaveAllocation.objects.create(employee=lee, leave_type='annual', days_allocated=4)
    assert _leave(client, lee, days_requested='3').status_code == 201
    response = _leave(client, lee, start_date='2026-10-19', days_requested='2')
    assert response.status_code == 400 and 'Only 1' in str(response.data)


def test_approving_does_not_revalidate(auth_client, superuser):
    client, lee = auth_client(superuser), _employee('Lee')
    leave = _leave(client, lee).data
    response = client.patch(f'/api/v1/hr/leave/{leave["id"]}/', {'status': 'approved'}, format='json')
    assert response.status_code == 200, response.data
    assert LeaveRequest.objects.get(pk=leave['id']).status == 'approved'
