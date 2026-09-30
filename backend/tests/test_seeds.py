"""bootstrap_system / seed_demo management commands."""

from io import StringIO

import pytest
from django.core.management import CommandError, call_command

from apps.core.models import Currency, Module, Role
from apps.payroll.models import TaxBracket

pytestmark = pytest.mark.django_db


def test_bootstrap_is_idempotent():
    counts = lambda: (Currency.objects.count(), Module.objects.count(), Role.objects.count(), TaxBracket.objects.count())  # noqa: E731
    before = counts()
    call_command("bootstrap_system", stdout=StringIO())
    assert counts() == before


def test_bootstrap_loads_zwg_brackets():
    """ZWG brackets were silently skipped before: ZWG currency was never seeded."""
    assert TaxBracket.objects.filter(currency__code="ZWG").count() == 6


def test_bootstrap_preserves_customised_role_access():
    role = Role.objects.get(role_type="accountant")
    role.modules.set(Module.objects.filter(code="dashboard"))
    call_command("bootstrap_system", stdout=StringIO())
    assert list(role.modules.values_list("code", flat=True)) == ["dashboard"]


def test_seed_demo_refuses_without_debug(settings):
    settings.DEBUG = False
    with pytest.raises(CommandError, match="Refusing"):
        call_command("seed_demo", stdout=StringIO())


def test_seed_demo_never_resets_existing_passwords():
    from apps.core.models import User

    admin = User.objects.get(email="admin@stohill.co.za")
    admin.set_password("my-own-strong-password")
    admin.save()
    call_command("seed_demo", "--force", stdout=StringIO())
    admin.refresh_from_db()
    assert admin.check_password("my-own-strong-password")
