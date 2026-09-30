"""
Maker/checker journal batch workflow over the API.

Regressions covered:
- approved batches could never be posted (service only accepted DRAFT entries)
- a superuser approving their own batch crashed with a 500 (view allowed it,
  model rejected it); segregation of duties now applies to everyone
- posting is all-or-nothing
"""

from decimal import Decimal as D

import pytest

from apps.finance.models import (
    ChartOfAccount,
    FiscalPeriod,
    Journal,
    JournalBatch,
    JournalEntry,
    JournalLine,
)
from tests.conftest import OPEN_PERIOD_DATE

pytestmark = pytest.mark.django_db

BATCHES = "/api/v1/finance/batches/"


def _make_batch(maker, amount=D("250.00"), balanced=True):
    period = FiscalPeriod.objects.get(start_date__lte=OPEN_PERIOD_DATE, end_date__gte=OPEN_PERIOD_DATE)
    journal = Journal.objects.get(code="GJ")
    batch = JournalBatch.objects.create(
        description="Test batch", fiscal_period=period, journal=journal, maker=maker,
        total_debits=amount, total_credits=amount if balanced else amount - D("1"),
    )
    entry = JournalEntry.objects.create(
        reference=f"TEST-{batch.batch_number}", journal=journal, fiscal_period=period,
        entry_date=OPEN_PERIOD_DATE, description="Accrual", batch=batch,
    )
    JournalLine.objects.create(entry=entry, account=ChartOfAccount.objects.get(code="5800"), side="debit", amount=amount)
    JournalLine.objects.create(entry=entry, account=ChartOfAccount.objects.get(code="2000"), side="credit", amount=amount)
    return batch


def _act(client, batch, action):
    return client.post(f"{BATCHES}{batch.pk}/{action}/")


def test_full_maker_checker_flow_posts_entries(auth_client, accountant, finance_manager):
    batch = _make_batch(maker=accountant)
    maker, checker = auth_client(accountant), auth_client(finance_manager)

    assert _act(maker, batch, "submit_for_approval").status_code == 200
    assert _act(checker, batch, "approve").status_code == 200
    response = _act(checker, batch, "post_batch")
    assert response.status_code == 200, response.json()

    batch.refresh_from_db()
    assert batch.status == JournalBatch.BatchStatus.POSTED
    assert batch.checker == finance_manager
    assert all(e.status == JournalEntry.EntryStatus.POSTED for e in batch.entries.all())


@pytest.mark.parametrize("maker_fixture", ["accountant", "superuser"])
def test_maker_cannot_approve_own_batch(request, auth_client, maker_fixture):
    maker = request.getfixturevalue(maker_fixture)
    batch = _make_batch(maker=maker)
    client = auth_client(maker)
    _act(client, batch, "submit_for_approval")

    response = _act(client, batch, "approve")

    assert response.status_code == 400  # not 500
    batch.refresh_from_db()
    assert batch.status == JournalBatch.BatchStatus.PENDING_APPROVAL


def test_unbalanced_batch_cannot_be_submitted(auth_client, accountant):
    batch = _make_batch(maker=accountant, balanced=False)
    assert _act(auth_client(accountant), batch, "submit_for_approval").status_code == 400


def test_cannot_post_unapproved_batch(auth_client, accountant, finance_manager):
    batch = _make_batch(maker=accountant)
    assert _act(auth_client(finance_manager), batch, "post_batch").status_code == 400


def test_posting_is_idempotent(auth_client, accountant, finance_manager):
    """A second post (e.g. double click) is rejected and doesn't double balances."""
    batch = _make_batch(maker=accountant, amount=D("75.00"))
    checker = auth_client(finance_manager)
    _act(auth_client(accountant), batch, "submit_for_approval")
    _act(checker, batch, "approve")
    assert _act(checker, batch, "post_batch").status_code == 200

    balance_after_first = ChartOfAccount.objects.get(code="5800").current_balance
    assert _act(checker, batch, "post_batch").status_code == 400
    assert ChartOfAccount.objects.get(code="5800").current_balance == balance_after_first
