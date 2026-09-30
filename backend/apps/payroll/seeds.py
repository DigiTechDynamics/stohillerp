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
from apps.finance.models import ChartOfAccount
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
    ("employer_nssa_rate", "Employer NSSA Rate", D("0.045"), "Employer share, on the same capped earnings"),
    ("zimdef_rate", "ZIMDEF Levy Rate", D("0.01"), "Manpower Development Fund levy on gross pay (employer)"),
]

SALARY_RULES = [
    {"code": "BASIC", "name": "Basic Salary", "category": "basic", "sequence": 10},
    {"code": "COMM", "name": "Commissions", "category": "allowance", "sequence": 20},
    {"code": "PAYE", "name": "Income Tax (PAYE)", "category": "deduction", "sequence": 30},
    {"code": "AIDS", "name": "AIDS Levy", "category": "deduction", "sequence": 40},
    {"code": "NSSA", "name": "NSSA Pension", "category": "deduction", "sequence": 50},
    {"code": "NET", "name": "Net Pay", "category": "net", "sequence": 100},
    {"code": "NSSA_ER", "name": "NSSA (Employer)", "category": "employer", "sequence": 110},
    {"code": "ZIMDEF", "name": "ZIMDEF Levy (Employer)", "category": "employer", "sequence": 120},
]

# Default GL mapping per rule: (debit account, credit account). Gross pay is
# debited (wages expense; commissions clear the payable accrued at approval)
# and every deduction plus net pay is credited to its liability, so a payroll
# run always balances.
RULE_ACCOUNTS = {
    "BASIC": ("5900", None),
    "COMM": ("2400", None),
    "PAYE": (None, "2600"),
    "AIDS": (None, "2610"),
    "NSSA": (None, "2620"),
    "NET": (None, "2630"),
    "NSSA_ER": ("5905", "2620"),
    "ZIMDEF": ("5905", "2640"),
}


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

    rules, new_rules = [], []
    for r in SALARY_RULES:
        rule, rule_created = SalaryRule.objects.get_or_create(code=r["code"], defaults=r)
        rules.append(rule)
        if rule_created:
            new_rules.append(rule)
    structure, created = SalaryStructure.objects.get_or_create(
        code="ZW_MONTHLY", defaults={"name": "Zimbabwe Standard Monthly"}
    )
    if created:
        structure.rules.set(rules)
    elif new_rules:
        # Newly introduced statutory rules (e.g. employer contributions) join
        # the standard structure; existing rule choices are left alone.
        structure.rules.add(*new_rules)

    # Fill GL accounts only on rules that have none, so admin choices stand.
    accounts = {a.code: a for a in ChartOfAccount.objects.filter(
        code__in=[c for pair in RULE_ACCOUNTS.values() for c in pair if c])}
    for rule in rules:
        if rule.debit_account_id or rule.credit_account_id or rule.code not in RULE_ACCOUNTS:
            continue
        debit, credit = RULE_ACCOUNTS[rule.code]
        rule.debit_account = accounts.get(debit)
        rule.credit_account = accounts.get(credit)
        rule.save(update_fields=["debit_account", "credit_account"])
