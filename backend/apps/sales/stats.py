"""Sales totals in the base currency (each sale converted at its own date)."""

from decimal import Decimal

from apps.finance.services.accounting import AccountingError
from apps.finance.services.fx import get_rate, to_base

ZERO = Decimal('0')


def base_totals(queryset, missing_rates: set):
    """
    (count, sale value, commission) in base currency. Sales in a currency with
    no rate on their date are left out and their currency added to
    `missing_rates`, so the caller can say the figure is incomplete.
    """
    count, value, commission = 0, ZERO, ZERO
    for sale in queryset.select_related('currency'):
        on = sale.transfer_date or sale.accepted_date or sale.offer_date
        try:
            rate = get_rate(sale.currency, on)
        except AccountingError:
            missing_rates.add(sale.currency.code)
            continue
        count += 1
        value += to_base(sale.sale_price, rate)
        commission += to_base(sale.commission_amount or ZERO, rate)
    return count, value, commission


def pct_change(current, previous):
    """Percentage change, or None when there is no earlier figure to compare with."""
    if not previous:
        return None
    return round(float((current - previous) / previous * 100), 1)
