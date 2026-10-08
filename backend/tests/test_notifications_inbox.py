"""
In-app notifications (UAT #1 / GAP-1): the bell in the top bar.

Covers the inbox API (own notifications only, unread count, mark read) and the
events that raise notifications: journal batches, AP approvals and leave.
"""

from datetime import timedelta
from decimal import Decimal as D

import pytest

from apps.core.models import Role
from apps.finance.models import ApprovalRule, ChartOfAccount, Supplier
from apps.notifications.inbox import notify, notify_module
from apps.notifications.models import Notification
from tests.conftest import OPEN_PERIOD_DATE, _make_user
from tests.test_batch_workflow import _act, _make_batch

pytestmark = pytest.mark.django_db

INBOX = '/api/v1/notifications/inbox/'


def test_inbox_lists_only_the_callers_notifications(auth_client, accountant, finance_manager):
    notify(accountant, 'For the accountant')
    notify(finance_manager, 'For the manager')
    client = auth_client(accountant)

    titles = [n['title'] for n in client.get(INBOX).json()['results']]
    assert titles == ['For the accountant']
    other = Notification.objects.get(recipient=finance_manager)
    assert client.post(f'{INBOX}{other.pk}/read/').status_code == 404


def test_unread_count_and_mark_read(auth_client, accountant):
    notify(accountant, 'One')
    notify(accountant, 'Two')
    client = auth_client(accountant)
    assert client.get(f'{INBOX}unread-count/').json() == {'count': 2}

    first = Notification.objects.filter(recipient=accountant).first()
    response = client.post(f'{INBOX}{first.pk}/read/')
    assert response.status_code == 200 and response.json()['is_read'] is True
    assert client.get(f'{INBOX}unread-count/').json() == {'count': 1}
    assert len(client.get(INBOX, {'unread': 'true'}).json()['results']) == 1

    assert client.post(f'{INBOX}read-all/').json() == {'marked_read': 1}
    assert client.get(f'{INBOX}unread-count/').json() == {'count': 0}


def test_any_staff_role_can_use_the_inbox(auth_client):
    agent = _make_user('agent@test.local', role_type='agent')
    assert auth_client(agent).get(f'{INBOX}unread-count/').status_code == 200


def test_repeated_event_refreshes_the_unread_notification(accountant):
    notify(accountant, 'Lease ends in 30 days', category='lease_alert', related='lease:1')
    notify(accountant, 'Lease ends in 30 days', category='lease_alert', related='lease:1')
    assert Notification.objects.filter(recipient=accountant).count() == 1


def test_portal_logins_get_no_notifications():
    tenant = _make_user('tenant@test.local', role_type='tenant')
    assert notify(tenant, 'Hello') == 0


def test_module_notifications_reach_module_users_not_others(finance_manager):
    agent = _make_user('agent2@test.local', role_type='agent')
    notify_module('finance_gl', 'GL news')
    assert Notification.objects.filter(recipient=finance_manager, title='GL news').exists()
    assert not Notification.objects.filter(recipient=agent).exists()


def test_batch_submission_notifies_checkers_and_approval_notifies_maker(auth_client, accountant, finance_manager):
    batch = _make_batch(maker=accountant)
    assert _act(auth_client(accountant), batch, 'submit_for_approval').status_code == 200

    pending = Notification.objects.get(recipient=finance_manager, category='batch_approval')
    assert batch.batch_number in pending.title and pending.link == '/finance/approvals'
    assert not Notification.objects.filter(recipient=accountant, category='batch_approval').exists()

    assert _act(auth_client(finance_manager), batch, 'approve').status_code == 200
    pending.refresh_from_db()
    assert pending.is_read                    # resolved once approved
    assert Notification.objects.filter(recipient=accountant, category='batch_result').exists()


def test_ap_approval_notifies_the_approver_role_then_the_creator(auth_client):
    role = Role.objects.get(role_type='finance_manager')
    ApprovalRule.objects.create(name='Over 100', document_type='supplier_invoice', min_amount=D('100'), role=role)
    clerk = _make_user('clerk@test.local', role_type='accountant')
    manager = _make_user('mgr@test.local', role_type='finance_manager')
    supplier = Supplier.objects.create(name='Notify Supplier', ap_account=ChartOfAccount.objects.get(code='2010'))
    response = auth_client(clerk).post('/api/v1/finance/supplier-invoices/', {
        'supplier': str(supplier.id), 'invoice_number': 'NS-1', 'invoice_date': str(OPEN_PERIOD_DATE),
        'due_date': str(OPEN_PERIOD_DATE + timedelta(days=30)),
        'lines': [{'description': 'Paint', 'expense_account': str(ChartOfAccount.objects.get(code='5300').id),
                   'unit_price': '500', 'line_total': '500'}]}, format='json')
    assert response.status_code == 201, response.data

    request = Notification.objects.get(recipient=manager, category='approval_request')
    assert 'waits for your approval' in request.title

    approved = auth_client(manager).post(f"/api/v1/finance/supplier-invoices/{response.data['id']}/approve/")
    assert approved.status_code == 200
    request.refresh_from_db()
    assert request.is_read
    assert Notification.objects.filter(recipient=clerk, category='approval_result', title__contains='approved').exists()


def test_leave_request_notifies_hr_and_decision_notifies_employee(auth_client):
    from apps.hr.models import Employee

    hr = _make_user('hr@test.local', role_type='hr_manager')
    staff_user = _make_user('staff@test.local', role_type='agent')
    employee = Employee.objects.filter(user__isnull=True).first()
    employee.user = staff_user
    employee.save(update_fields=['user'])

    response = auth_client(hr).post('/api/v1/hr/leave/', {
        'employee': str(employee.id), 'leave_type': 'annual', 'start_date': '2025-07-01',
        'end_date': '2025-07-03', 'days_requested': '3'}, format='json')
    assert response.status_code == 201, response.data
    assert Notification.objects.filter(category='leave_request', recipient=hr).exists()
    assert not Notification.objects.filter(category='leave_request', recipient=staff_user).exists()

    auth_client(hr).patch(f"/api/v1/hr/leave/{response.data['id']}/", {'status': 'approved'}, format='json')
    result = Notification.objects.get(recipient=staff_user, category='leave_result')
    assert 'approved' in result.title
    assert not Notification.objects.filter(category='leave_request', read_at__isnull=True).exists()
