"""
Double-entry posting engine: balance validation, account balances,
immutability of posted entries, and reversals (ported from verify_posting.py).
"""

from decimal import Decimal as D

import pytest
from django.core.exceptions import ValidationError

from apps.finance.models import ChartOfAccount, JournalEntry
from apps.finance.services.accounting import AccountingError, AccountingService, PostingData
from tests.conftest import OPEN_PERIOD_DATE

pytestmark = pytest.mark.django_db

BANK, RENT = "1010", "4100"


def _balance(code):
    return ChartOfAccount.objects.get(code=code).current_balance


def _rent_receipt(amount=D("1500.00")):
    posting = PostingData(description="Rent receipt", entry_date=OPEN_PERIOD_DATE)
    posting.add_debit(BANK, amount, "Bank")
    posting.add_credit(RENT, amount, "Rental income")
    return posting


def test_balanced_entry_posts_and_updates_balances(superuser):
    bank_before, rent_before = _balance(BANK), _balance(RENT)

    entry = AccountingService(user=superuser).post_entry(_rent_receipt())

    assert entry.status == JournalEntry.EntryStatus.POSTED
    assert entry.get_total_debits() == entry.get_total_credits() == D("1500.00")
    assert _balance(BANK) == bank_before + D("1500.00")  # asset: debit increases
    assert _balance(RENT) == rent_before + D("1500.00")  # revenue: credit increases


def test_unbalanced_entry_is_rejected(superuser):
    posting = PostingData(description="Broken", entry_date=OPEN_PERIOD_DATE)
    posting.add_debit(BANK, D("100.00"))
    posting.add_credit(RENT, D("99.99"))
    with pytest.raises(AccountingError, match="not balanced"):
        AccountingService(user=superuser).post_entry(posting)


def test_empty_entry_is_rejected(superuser):
    with pytest.raises(AccountingError):
        AccountingService(user=superuser).post_entry(
            PostingData(description="Empty", entry_date=OPEN_PERIOD_DATE)
        )


def test_posted_entries_are_immutable(superuser):
    entry = AccountingService(user=superuser).post_entry(_rent_receipt())
    entry.description = "tampered"
    with pytest.raises(ValidationError):
        entry.save()


def test_reversal_nets_balances_to_zero(superuser):
    service = AccountingService(user=superuser)
    bank_before = _balance(BANK)

    entry = service.post_entry(_rent_receipt(D("800.00")))
    service.create_reversal(entry)

    assert _balance(BANK) == bank_before


def test_draft_entry_cannot_be_reversed(superuser):
    from apps.finance.models import FiscalPeriod, Journal

    draft = JournalEntry.objects.create(
        reference="TEST-DRAFT-1",
        journal=Journal.objects.get(code="GJ"),
        fiscal_period=FiscalPeriod.objects.get(start_date__lte=OPEN_PERIOD_DATE, end_date__gte=OPEN_PERIOD_DATE),
        entry_date=OPEN_PERIOD_DATE,
        description="Draft",
    )
    with pytest.raises(AccountingError, match="Only posted"):
        AccountingService(user=superuser).create_reversal(draft)


def test_entry_cannot_be_reversed_twice(superuser):
    service = AccountingService(user=superuser)
    entry = service.post_entry(_rent_receipt(D("40.00")))
    service.create_reversal(entry)
    with pytest.raises(AccountingError):
        service.create_reversal(entry)
