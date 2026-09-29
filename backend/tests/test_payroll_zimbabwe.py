"""
Zimbabwe statutory deductions (ported from test_zimbabwe_payroll.py).
Brackets and rates come from the reference data loaded by bootstrap_system.
"""

from decimal import Decimal as D

import pytest

from apps.payroll.services.zimbabwe import ZimbabweTaxService as Tax

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    "gross, currency, paye, aids, nssa",
    [
        # 1500 * 30% - 85 = 365.00; AIDS 3% of PAYE; NSSA 4.5% capped at 700 USD
        (D("1500.00"), "USD", D("365.00"), D("10.95"), D("31.50")),
        # 5000 * 25% - 474.60 = 775.40; NSSA 4.5% of 5000 (under ZWG ceiling)
        (D("5000.00"), "ZWG", D("775.40"), D("23.26"), D("225.00")),
    ],
)
def test_paye_aids_nssa(gross, currency, paye, aids, nssa):
    computed_paye = Tax.calculate_paye(gross, currency)
    assert computed_paye == paye
    assert Tax.calculate_aids_levy(computed_paye) == aids
    assert Tax.calculate_nssa(gross, currency) == nssa


def test_tax_free_band():
    assert Tax.calculate_paye(D("100.00"), "USD") == D("0.00")


def test_top_bracket_is_open_ended():
    # 10000 * 40% - 335 = 3665.00
    assert Tax.calculate_paye(D("10000.00"), "USD") == D("3665.00")


def test_nssa_is_capped_at_ceiling():
    assert Tax.calculate_nssa(D("5000.00"), "USD") == D("31.50")
