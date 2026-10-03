"""
Query helpers for list endpoints: per-row counts and ledger balances as
subqueries of the list query, instead of one query per row.
"""

from decimal import Decimal

from django.db.models import Case, Count, DecimalField, F, OuterRef, Subquery, Sum, Value, When
from django.db.models.functions import Coalesce


def subquery_count(model, field, **filters):
    """Number of `model` rows whose `field` points at the outer row."""
    rows = model.objects.filter(**{field: OuterRef('pk')}, **filters).order_by().values(field) \
        .annotate(n=Count('pk')).values('n')[:1]
    return Coalesce(Subquery(rows), Value(0))


def ledger_balance(debit_positive=True, **outer_filters):
    """
    Signed total of posted journal lines matching `outer_filters` (values may be
    OuterRef). Debits count positive for asset-side ledgers (AR), credits for AP.
    """
    from apps.finance.models import JournalEntry, JournalLine

    money = DecimalField(max_digits=18, decimal_places=2)
    sign = (When(side='debit', then=F('amount')), ) if debit_positive else (When(side='credit', then=F('amount')), )
    lines = JournalLine.objects.filter(entry__status__in=JournalEntry.LEDGER_STATUSES, **outer_filters) \
        .order_by().values('account') \
        .annotate(total=Sum(Case(*sign, default=-F('amount'), output_field=money))).values('total')[:1]
    return Coalesce(Subquery(lines, output_field=money), Value(Decimal('0.00')), output_field=money)
