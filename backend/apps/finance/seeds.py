"""
Finance reference data: a starter chart of accounts, the system journals, a
default posting profile and the fiscal year containing today.

Previously all of this lived only in `seed_demo`, which refuses to run in
production, so a fresh production install could not post a single entry.
Everything here is get_or_create: existing accounts, journals and profiles
are never modified.
"""

import logging
from calendar import monthrange
from datetime import date
from decimal import Decimal

from django.conf import settings
from django.db import transaction

from apps.finance.models import ChartOfAccount, FiscalPeriod, FiscalYear, Journal, PostingProfile, TaxCode

logger = logging.getLogger("stohill.seeds")

# (code, name, type, sub_type, parent_code, allow_direct_posting)
STARTER_ACCOUNTS = [
    # Assets
    ("1000", "Current Assets", "asset", "current_asset", None, False),
    ("1010", "Bank - Main Operating", "asset", "bank", "1000", True),
    ("1020", "Bank - Trust Account", "asset", "bank", "1000", True),
    ("1100", "Accounts Receivable", "asset", "receivable", "1000", True),
    ("1110", "Commission Receivable", "asset", "receivable", "1000", True),
    ("1120", "Withholding Tax Receivable", "asset", "current_asset", "1000", True),
    ("1200", "Prepaid Expenses", "asset", "current_asset", "1000", True),
    ("1500", "Fixed Assets", "asset", "fixed_asset", None, False),
    ("1510", "Property Portfolio", "asset", "fixed_asset", "1500", True),
    ("1520", "Office Equipment", "asset", "fixed_asset", "1500", True),
    ("1530", "Motor Vehicles", "asset", "fixed_asset", "1500", True),
    ("1540", "Development Work in Progress", "asset", "fixed_asset", "1500", True),
    ("1550", "Furniture & Fittings", "asset", "fixed_asset", "1500", True),
    ("1590", "Accumulated Depreciation", "contra", "depreciation", "1500", True),
    # Liabilities
    ("2000", "Current Liabilities", "liability", "current_liability", None, False),
    ("2010", "Accounts Payable - Trade", "liability", "payable", "2000", True),
    ("2100", "VAT Payable", "liability", "tax_liability", "2000", True),
    ("2110", "VAT Receivable", "asset", "current_asset", "1000", True),
    ("2200", "Tenant Deposits Held", "liability", "current_liability", "2000", True),
    ("2210", "Owner Funds Held (Trust)", "liability", "current_liability", "2000", True),
    ("2300", "Deferred Rental Revenue", "liability", "current_liability", "2000", True),
    ("2400", "Commission Payable", "liability", "payable", "2000", True),
    ("2600", "PAYE Payable", "liability", "tax_liability", "2000", True),
    ("2610", "AIDS Levy Payable", "liability", "tax_liability", "2000", True),
    ("2620", "NSSA Payable", "liability", "current_liability", "2000", True),
    ("2630", "Net Salaries Payable", "liability", "current_liability", "2000", True),
    ("2640", "ZIMDEF Payable", "liability", "current_liability", "2000", True),
    ("2500", "Long-Term Liabilities", "liability", "long_term_liability", None, False),
    ("2510", "Bond - Property Portfolio", "liability", "long_term_liability", "2500", True),
    # Equity
    ("3000", "Equity", "equity", "retained_earnings", None, False),
    ("3100", "Share Capital", "equity", "share_capital", "3000", True),
    ("3200", "Retained Earnings", "equity", "retained_earnings", "3000", True),
    # Revenue
    ("4000", "Revenue", "revenue", "operating_revenue", None, False),
    ("4100", "Rental Income", "revenue", "operating_revenue", "4000", True),
    ("4200", "Commission Income", "revenue", "operating_revenue", "4000", True),
    ("4300", "Property Management Fees", "revenue", "operating_revenue", "4000", True),
    ("4400", "Sale Proceeds", "revenue", "operating_revenue", "4000", True),
    ("4900", "Other Income", "revenue", "other_income", "4000", True),
    ("4910", "Late Payment Fees", "revenue", "other_income", "4000", True),
    ("4920", "Recoveries & Recharges", "revenue", "other_income", "4000", True),
    ("4950", "Realised Exchange Gains", "revenue", "other_income", "4000", True),
    ("4960", "Unrealised Exchange Gains", "revenue", "other_income", "4000", True),
    ("4970", "Profit / Loss on Disposal of Assets", "revenue", "other_income", "4000", True),
    # Expenses
    ("5000", "Cost of Sales", "expense", "cost_of_sales", None, False),
    ("5100", "Commission Expense", "expense", "cost_of_sales", "5000", True),
    ("5200", "Property Operating Expenses", "expense", "operating_expense", None, False),
    ("5300", "Maintenance & Repairs", "expense", "operating_expense", "5200", True),
    ("5400", "Rates & Levies", "expense", "operating_expense", "5200", True),
    ("5500", "Insurance", "expense", "operating_expense", "5200", True),
    ("5600", "Bond Interest", "expense", "operating_expense", "5200", True),
    ("5700", "Depreciation", "expense", "depreciation", "5200", True),
    ("5800", "Administrative Expenses", "expense", "admin_expense", None, False),
    ("5900", "Salaries & Wages", "expense", "admin_expense", "5800", True),
    ("5905", "Employer Payroll Contributions", "expense", "admin_expense", "5800", True),
    ("5910", "Marketing & Advertising", "expense", "admin_expense", "5800", True),
    ("5920", "Office Expenses", "expense", "admin_expense", "5800", True),
    ("5940", "Bad Debts", "expense", "admin_expense", "5800", True),
    ("5950", "Realised Exchange Losses", "expense", "admin_expense", "5800", True),
    ("5960", "Unrealised Exchange Losses", "expense", "admin_expense", "5800", True),
]

# (code, name, auto_posting)
JOURNALS = [
    ("GJ", "General Journal", False),
    ("SJ", "Sales Journal", True),
    ("RJ", "Rentals Journal", True),
    ("CJ", "Commission Journal", True),
    ("PJ", "Purchases & Payroll Journal", True),
    ("AJ", "Adjustment Journal", False),
    ("YE", "Year-End Closing Journal", True),
]

# PostingProfile field -> account code
DEFAULT_PROFILE = {
    "bank_main": "1010",
    "bank_trust": "1020",
    "accounts_receivable": "1100",
    "commission_receivable": "1110",
    "accounts_payable": "2010",
    "vat_payable": "2100",
    "vat_receivable": "2110",
    "tenant_deposits": "2200",
    "commission_payable": "2400",
    "retained_earnings": "3200",
    "rental_income": "4100",
    "commission_income": "4200",
    "sale_revenue": "4400",
    "commission_expense": "5100",
    "property_inventory": "1510",
    "owner_funds": "2210",
    "management_fees": "4300",
    "recoveries_income": "4920",
    "maintenance": "5300",
    "withholding_tax": "1120",
}


@transaction.atomic
def seed_chart_of_accounts() -> None:
    by_code = {}
    for code, name, acct_type, sub_type, parent_code, allow_direct in STARTER_ACCOUNTS:
        account, created = ChartOfAccount.objects.get_or_create(
            code=code,
            defaults={
                "name": name, "account_type": acct_type, "account_sub_type": sub_type,
                "parent": by_code.get(parent_code), "allow_direct_posting": allow_direct,
                "is_system": True,
            },
        )
        by_code[code] = account
        if created:
            logger.info("Created account %s %s", code, name)


@transaction.atomic
def seed_journals() -> None:
    for code, name, auto in JOURNALS:
        Journal.objects.get_or_create(code=code, defaults={"name": name, "auto_posting": auto})


@transaction.atomic
def seed_posting_profile() -> None:
    """Create a default profile only on a system that has none at all."""
    if PostingProfile.objects.exists():
        return
    accounts = {a.code: a for a in ChartOfAccount.objects.filter(code__in=DEFAULT_PROFILE.values())}
    if len(accounts) != len(set(DEFAULT_PROFILE.values())):
        logger.warning("Starter accounts missing; default posting profile not created.")
        return
    PostingProfile.objects.create(
        name="Default", is_default=True,
        **{field: accounts[code] for field, code in DEFAULT_PROFILE.items()},
    )


# Fixed asset categories: (code, name, asset cost account, description).
ASSET_CATEGORIES = [
    ("IT", "Office Equipment & Computers", "1520", "Computers, printers and office equipment"),
    ("VEH", "Motor Vehicles", "1530", "Company vehicles"),
    ("FURN", "Furniture & Fittings", "1550", "Office furniture and fittings"),
]


@transaction.atomic
def seed_asset_categories() -> None:
    """Starter fixed asset categories (only those whose accounts exist; never overwrites)."""
    from apps.fixed_assets.models import AssetCategory

    codes = ["1520", "1530", "1550", "1590", "5700", "4970"]
    accounts = {a.code: a for a in ChartOfAccount.objects.filter(code__in=codes)}
    if not {"1590", "5700", "4970"} <= set(accounts):
        logger.warning("Depreciation accounts missing; starter asset categories not created.")
        return
    for code, name, cost_code, description in ASSET_CATEGORIES:
        if cost_code not in accounts:
            continue
        AssetCategory.objects.get_or_create(code=code, defaults={
            "name": name, "description": description, "asset_cost_account": accounts[cost_code],
            "accum_depr_account": accounts["1590"], "depr_expense_account": accounts["5700"],
            "disposal_gain_loss_account": accounts["4970"]})


@transaction.atomic
def seed_tax_codes() -> None:
    """Standard, zero-rated and exempt VAT codes (rate from COMPANY_VAT_RATE)."""
    rate = (Decimal(str(settings.COMPANY_CONFIG.get("vat_rate", 0))) * 100).quantize(Decimal("0.01"))
    output_vat = ChartOfAccount.objects.filter(code="2100").first()
    input_vat = ChartOfAccount.objects.filter(code="2110").first()
    for code, name, code_rate in [("STD", "Standard rate", rate), ("ZERO", "Zero rated", Decimal("0")),
                                  ("EXEMPT", "Exempt", Decimal("0"))]:
        TaxCode.objects.get_or_create(code=code, defaults={
            "name": name, "rate": code_rate, "collected_account": output_vat, "paid_account": input_vat})


def fiscal_year_bounds(day: date, start_month: int):
    """(start, end, name) of the fiscal year containing `day`."""
    fy_year = day.year if day.month >= start_month else day.year - 1
    start = date(fy_year, start_month, 1)
    end_year, end_month = (fy_year, 12) if start_month == 1 else (fy_year + 1, start_month - 1)
    end = date(end_year, end_month, monthrange(end_year, end_month)[1])
    name = f"FY {fy_year}" if start_month == 1 else f"FY {fy_year}/{str(fy_year + 1)[-2:]}"
    return start, end, name


@transaction.atomic
def ensure_fiscal_year(day: date) -> FiscalYear:
    """Get or create the fiscal year containing `day`, with its 12 monthly periods."""
    start_month = settings.COMPANY_CONFIG.get("fiscal_year_start_month", 3)
    existing = FiscalYear.objects.filter(start_date__lte=day, end_date__gte=day).first()
    if existing:
        return existing
    start, end, name = fiscal_year_bounds(day, start_month)
    fy = FiscalYear.objects.create(name=name, start_date=start, end_date=end)
    for num in range(1, 13):
        month_index = start_month - 1 + (num - 1)
        y, m = start.year + month_index // 12, month_index % 12 + 1
        FiscalPeriod.objects.create(
            fiscal_year=fy, period_number=num, name=date(y, m, 1).strftime("%B %Y"),
            start_date=date(y, m, 1), end_date=date(y, m, monthrange(y, m)[1]),
        )
    logger.info("Created fiscal year %s", name)
    return fy


def seed_finance_defaults() -> None:
    from django.utils import timezone

    seed_chart_of_accounts()
    seed_journals()
    seed_posting_profile()
    seed_tax_codes()
    seed_asset_categories()
    ensure_fiscal_year(timezone.localdate())
