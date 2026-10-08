"""Audit trail (UAT GAP-4): API changes and sign-ins are recorded and can be searched."""

import pytest

from apps.core.models import AuditLog
from tests.conftest import TEST_PASSWORD

pytestmark = pytest.mark.django_db

LOGS = '/api/v1/core/audit-logs/'


def test_api_create_update_delete_are_recorded(auth_client, superuser):
    client = auth_client(superuser)
    created = client.post('/api/v1/core/currencies/', {'code': 'XAU', 'name': 'Gold', 'symbol': 'Au'}, format='json')
    assert created.status_code == 201, created.data
    pk = created.data['id']
    entry = AuditLog.objects.get(action='create', object_id=pk)
    assert entry.user == superuser and entry.changes['code'] == 'XAU'

    client.patch(f'/api/v1/core/currencies/{pk}/', {'name': 'Gold ounce'}, format='json')
    assert AuditLog.objects.filter(action='update', object_id=pk).exists()
    client.delete(f'/api/v1/core/currencies/{pk}/')
    assert AuditLog.objects.filter(action='delete', object_id=pk).exists()


def test_failed_requests_and_reads_are_not_recorded(auth_client, superuser):
    client = auth_client(superuser)
    before = AuditLog.objects.count()
    client.get('/api/v1/core/currencies/')
    client.post('/api/v1/core/currencies/', {}, format='json')      # invalid: 400
    assert AuditLog.objects.count() == before


def test_secrets_are_masked(auth_client, superuser):
    client = auth_client(superuser)
    response = client.post('/api/v1/core/users/', {'email': 'new.user@test.local', 'first_name': 'New',
                                                  'last_name': 'User', 'password': 'S3cret-pass-123'}, format='json')
    assert response.status_code == 201, response.data
    entry = AuditLog.objects.filter(action='create', model_name='User').latest('timestamp')
    assert entry.changes['password'] == '***'


def test_sign_in_is_recorded(api_client, superuser):
    response = api_client.post('/api/v1/auth/login/', {'email': superuser.email, 'password': TEST_PASSWORD}, format='json')
    assert response.status_code == 200
    assert AuditLog.objects.filter(action='login', user=superuser).exists()


def test_log_is_filterable_and_admin_only(auth_client, superuser, accountant):
    AuditLog.objects.create(user=superuser, action='post', model_name='Journal Entry', object_id='1', object_repr='JE-1')
    client = auth_client(superuser)
    rows = client.get(LOGS, {'action': 'post', 'search': 'JE-1'}).json()['results']
    assert [r['object_repr'] for r in rows] == ['JE-1']
    assert 'Journal Entry' in client.get(f'{LOGS}models/').json()
    assert auth_client(accountant).get(LOGS).status_code == 403
