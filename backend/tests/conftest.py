"""
Shared pytest fixtures.

The test database is created once per session and loaded with the same data a
developer gets from `manage.py seed_demo` (which includes bootstrap_system).
Every test then runs inside a transaction that is rolled back, so tests are
isolated but don't pay the seeding cost each time.
"""

from datetime import date
from io import StringIO

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.core.models import User

# Inside the seeded fiscal years (Mar 2024 - Feb 2026), which are open.
OPEN_PERIOD_DATE = date(2025, 6, 15)
TEST_PASSWORD = "Str0ng-test-passw0rd!"


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup, django_db_blocker):
    """Seed reference + demo data once for the whole test session."""
    with django_db_blocker.unblock():
        call_command("seed_demo", "--force", stdout=StringIO())


def _make_user(email, *, superuser=False, role_type=None):
    user = User.objects.create_user(
        email=email,
        password=TEST_PASSWORD,
        first_name=email.split("@")[0].title(),
        last_name="Tester",
        is_active=True,
        is_staff=superuser,
        is_superuser=superuser,
    )
    if role_type:
        from apps.core.models import Role

        user.roles.add(Role.objects.get(role_type=role_type))
    return user


@pytest.fixture
def superuser(db):
    return _make_user("root@test.local", superuser=True, role_type="super_admin")


@pytest.fixture
def finance_manager(db):
    return _make_user("fm@test.local", role_type="finance_manager")


@pytest.fixture
def accountant(db):
    return _make_user("acc@test.local", role_type="accountant")


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def auth_client():
    """Factory: auth_client(user) -> APIClient authenticated as that user."""

    def _client(user):
        client = APIClient()
        client.force_authenticate(user=user)
        return client

    return _client
