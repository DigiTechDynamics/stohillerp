"""Regression tests for bugs fixed during the production-hardening pass."""

from datetime import date
from decimal import Decimal as D

import pytest

from apps.crm.models import Opportunity, Pipeline

pytestmark = pytest.mark.django_db


def _pipeline():
    return Pipeline.objects.get(name="Sales Pipeline")


def test_opportunity_can_be_created():
    """
    Opportunity.save() used `if self.pk:` with a UUID pk (always set), so it
    looked up a not-yet-saved row and raised DoesNotExist on every create.
    """
    pipeline = _pipeline()
    opp = Opportunity.objects.create(
        title="Regression lead", pipeline=pipeline, stage=pipeline.stages.order_by("position").first()
    )
    assert opp.reference  # auto-generated


def test_stage_change_updates_stage_entered_at():
    pipeline = _pipeline()
    first, second = pipeline.stages.order_by("position")[:2]
    opp = Opportunity.objects.create(title="Mover", pipeline=pipeline, stage=first)
    before = opp.stage_entered_at

    opp.stage = second
    opp.save()

    assert opp.stage_entered_at is not None and opp.stage_entered_at != before


def test_opportunity_create_via_api(auth_client, superuser):
    pipeline = _pipeline()
    stage = pipeline.stages.order_by("position").first()
    response = auth_client(superuser).post(
        "/api/v1/crm/opportunities/",
        {"title": "API lead", "pipeline": str(pipeline.pk), "stage": str(stage.pk)},
        format="json",
    )
    assert response.status_code in (200, 201), response.json()


@pytest.fixture
def fixed_asset():
    from apps.finance.models import ChartOfAccount
    from apps.fixed_assets.models import AssetCategory, FixedAsset

    acc = ChartOfAccount.objects.get
    category = AssetCategory.objects.create(
        code="VEH-R", name="Vehicles",
        asset_cost_account=acc(code="1010"), accum_depr_account=acc(code="1010"),
        depr_expense_account=acc(code="5800"), disposal_gain_loss_account=acc(code="5800"),
    )
    return FixedAsset.objects.create(
        code="FA-T1", name="Test vehicle", category=category,
        acquisition_date=date(2025, 1, 10), acquisition_cost=D("12000.00"),
    )


@pytest.mark.parametrize("proceeds", ["not-a-number", "-5"])
def test_asset_disposal_validates_proceeds(auth_client, superuser, fixed_asset, proceeds):
    """dispose() used Decimal without importing it: every call was a NameError 500."""
    response = auth_client(superuser).post(
        f"/api/v1/fixed-assets/assets/{fixed_asset.pk}/dispose/",
        {"disposal_date": "2025-06-15", "net_proceeds": proceeds},
        format="json",
    )
    assert response.status_code == 400


def test_contacts_list_does_not_crash(auth_client, superuser):
    """ContactSerializer read `obj.opportunities` (related_name is contact_opportunities)."""
    response = auth_client(superuser).get("/api/v1/crm/contacts/")
    assert response.status_code == 200
    assert "opportunity_count" in response.json()["results"][0]


def test_balance_sheet_defaults_to_today_and_balances(auth_client, superuser):
    """
    Without as_at_date the view crashed (None in a query). It also ignored
    unclosed revenue/expense, so it could never balance mid-year.
    """
    from apps.finance.services.accounting import AccountingService, PostingData
    from tests.conftest import OPEN_PERIOD_DATE

    posting = PostingData(description="Rent", entry_date=OPEN_PERIOD_DATE)
    posting.add_debit("1010", D("500.00"))
    posting.add_credit("4100", D("500.00"))
    AccountingService(user=superuser).post_entry(posting)

    response = auth_client(superuser).get("/api/v1/finance/reports/balance-sheet/")
    assert response.status_code == 200
    assert response.json()["balanced"] is True


def test_balance_sheet_rejects_bad_date(auth_client, superuser):
    response = auth_client(superuser).get("/api/v1/finance/reports/balance-sheet/?as_at_date=31-12-2025")
    assert response.status_code == 400
