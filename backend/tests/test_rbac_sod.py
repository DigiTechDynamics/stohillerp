"""Segregation-of-duties rule detection (ported from test_sod.py / test_rbac_sod.py)."""

import pytest

from apps.core.models import Module, Role, SODRule, User

pytestmark = pytest.mark.django_db


@pytest.fixture
def gl_vs_banking_rule():
    return SODRule.objects.create(
        name="GL vs Banking",
        module_a=Module.objects.get(code="finance_gl"),
        module_b=Module.objects.get(code="banking"),
        severity=SODRule.Severity.CRITICAL,
        description="Cannot both post to the GL and reconcile the bank.",
    )


def _user_with_modules(*codes):
    role = Role.objects.create(name=f"Test {'+'.join(codes)}", role_type=f"test_{'_'.join(codes)}"[:50])
    role.modules.set(Module.objects.filter(code__in=codes))
    user = User.objects.create_user(email=f"{'_'.join(codes)}@sod.local", password="x" * 12)
    user.roles.add(role)
    return user


def test_conflicting_modules_are_reported(gl_vs_banking_rule):
    user = _user_with_modules("finance_gl", "banking")
    conflicts = user.check_sod_conflicts()
    assert len(conflicts) == 1
    assert conflicts[0]["severity"] == "critical"


def test_single_side_is_not_a_conflict(gl_vs_banking_rule):
    assert _user_with_modules("finance_gl").check_sod_conflicts() == []


def test_inactive_rule_is_ignored(gl_vs_banking_rule):
    gl_vs_banking_rule.is_active = False
    gl_vs_banking_rule.save()
    assert _user_with_modules("finance_gl", "banking").check_sod_conflicts() == []


def test_default_accountant_role_has_no_payroll_access():
    accountant = Role.objects.get(role_type="accountant")
    assert not accountant.modules.filter(code="payroll").exists()
