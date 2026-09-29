"""
Payroll reference data for Zimbabwe: PAYE brackets (USD and ZWG), statutory
rates, and the standard salary rules/structure. Idempotent.

Brackets are monthly. Review these against current ZIMRA tables before each
tax year; they are data, not code, and can be edited in the admin.
"""

import logging
from decimal import Decimal as D

from django.db import transaction

from apps.core.models import Currency
from apps.payroll.models import PayrollSetting, SalaryRule, SalaryStructure, TaxBracket

logger = logging.getLogger("stohill.seeds")

# (min, max or None, rate %, fixed deduction)
TAX_BRACKETS = {
    "USD": [
        (D("0"), D("100"), D("0"), D("0")),
        (D("100.01"), D("300"), D("20"), D("20")),
        (D("300.01"), D("1000"), D("25"), D("35")),
        (D("1000.01"), D("2000"), D("30"), D("85")),
        (D("2000.01"), D("3000"), D("35"), D("185")),
        (D("3000.01"), None, D("40"), D("335")),
    ],
    "ZWG": [
        (D("0"), D("1356"), D("0"), D("0")),
        (D("1356.01"), D("4068"), D("20"), D("271.20")),
        (D("4068.01"), D("13560"), D("25"), D("474.60")),
        (D("13560.01"), D("27120"), D("30"), D("1152.60")),
        (D("27120.01"), D("40680"), D("35"), D("2508.60")),
        (D("40680.01"), None, D("40"), D("4542.60")),
    ],
}

SETTINGS = [
    ("aids_levy_rate", "AIDS Levy Rate", D("0.03"), "Percentage of PAYE"),
    ("nssa_rate", "NSSA Rate", D("0.045"), "Percentage of Basic Salary"),
    ("nssa_ceiling_usd", "NSSA Ceiling (USD)", D("700.00"), ""),
    ("nssa_ceiling_zwg", "NSSA Ceiling (ZWG)", D("24763.00"), ""),
]

SALARY_RULES = [
    {"code": "BASIC", "name": "Basic Salary", "category": "basic", "sequence": 10},
    {"code": "COMM", "name": "Commissions", "category": "allowance", "sequence": 20},
    {"code": "PAYE", "name": "Income Tax (PAYE)", "category": "deduction", "sequence": 30},
    {"code": "AIDS", "name": "AIDS Levy", "category": "deduction", "sequence": 40},
    {"code": "NSSA", "name": "NSSA Pension", "category": "deduction", "sequence": 50},
    {"code": "NET", "name": "Net Pay", "category": "net", "sequence": 100},
]


@transaction.atomic
def seed_payroll_config() -> None:
    for code, brackets in TAX_BRACKETS.items():
        currency = Currency.objects.filter(code=code).first()
        if currency is None:
            # Currencies are seeded first by bootstrap_system; this is a guard.
            logger.warning("Currency %s missing; skipping its tax brackets", code)
            continue
        for min_amount, max_amount, rate, fixed in brackets:
            TaxBracket.objects.get_or_create(
                currency=currency,
                min_amount=min_amount,
                max_amount=max_amount,
                defaults={"tax_rate": rate, "fixed_deduction": fixed},
            )

    # get_or_create (not update_or_create): never overwrite values an admin
    # has since adjusted in the UI.
    for key, name, value, description in SETTINGS:
        PayrollSetting.objects.get_or_create(
            key=key, defaults={"name": name, "value": value, "description": description}
        )

    rules = [
        SalaryRule.objects.get_or_create(code=r["code"], defaults=r)[0] for r in SALARY_RULES
    ]
    structure, created = SalaryStructure.objects.get_or_create(
        code="ZW_MONTHLY", defaults={"name": "Zimbabwe Standard Monthly"}
    )
    if created:
        structure.rules.set(rules)
