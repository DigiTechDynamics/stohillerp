"""
Exchange rates and base-currency conversion.

Rates are stored per currency as the base-currency value of one unit
(ExchangeRate docs: if USD is base, ZWG 0.0375 means 1 ZWG = 0.0375 USD), so
base amount = document amount x rate. The rate used is the latest one on or
before the transaction date.
"""

from datetime import date
from decimal import Decimal

from apps.core.models import Currency

ONE = Decimal('1')
CENT = Decimal('0.01')


def base_currency():
    return Currency.objects.filter(is_base=True).first()


def is_base(currency) -> bool:
    if currency is None:
        return True
    base = base_currency()
    return base is None or currency.pk == base.pk


def get_rate(currency, on: date) -> Decimal:
    """Base value of one unit of `currency` on `on`. Base currency (or none) -> 1."""
    from apps.finance.models import ExchangeRate
    from apps.finance.services.accounting import AccountingError

    if is_base(currency):
        return ONE
    rate = ExchangeRate.objects.filter(currency=currency, effective_date__lte=on) \
        .order_by('-effective_date').values_list('rate', flat=True).first()
    if rate is None:
        raise AccountingError(f'No exchange rate for {currency.code} on or before {on}. '
                              f'Add one under Finance > Currencies.')
    return rate


def to_base(amount: Decimal, rate: Decimal) -> Decimal:
    return (Decimal(amount) * Decimal(rate)).quantize(CENT)


def currency_code(currency) -> str:
    if currency is not None:
        return currency.code
    base = base_currency()
    return base.code if base else 'USD'
