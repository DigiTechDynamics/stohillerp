"""
Core reference data: currencies, access modules, roles and number sequences.

Everything here is idempotent (safe to run repeatedly) and required in every
environment, including production. Called by `manage.py bootstrap_system`.
"""

import logging

from django.db import transaction

from apps.core.models import Currency, Module, Role
from apps.core.services.number_sequence import NumberSequenceService

logger = logging.getLogger("stohill.seeds")

CURRENCIES = [
    # (code, name, symbol, is_base)
    ("USD", "United States Dollar", "$", True),
    ("ZWG", "Zimbabwe Gold", "ZiG", False),
    ("ZAR", "South African Rand", "R", False),
]

MODULES = [
    {"name": "Command Center", "code": "dashboard", "description": "Main dashboard and executive overviews", "icon": "LayoutDashboard"},
    {"name": "CRM Pipeline", "code": "crm", "description": "Leads, opportunities and contact management", "icon": "Users"},
    {"name": "Properties", "code": "properties", "description": "Property inventory and details", "icon": "Building2"},
    {"name": "Rental Management", "code": "rentals", "description": "Leases, tenants and maintenance", "icon": "Home"},
    {"name": "Sales & Deals", "code": "sales", "description": "Transaction processing and sales tracking", "icon": "TrendingUp"},
    {"name": "Accounts Payable", "code": "finance_ap", "description": "Supplier invoices and payments", "icon": "Briefcase"},
    {"name": "Accounts Receivable", "code": "finance_ar", "description": "Customer invoices and receipts", "icon": "FileSearch"},
    {"name": "Bank & Cash", "code": "banking", "description": "Bank accounts and statement reconciliation", "icon": "Landmark"},
    {"name": "Commissions", "code": "commissions", "description": "Agent commission calculation and approval", "icon": "Award"},
    {"name": "GL & Financial Control", "code": "finance_gl", "description": "General ledger, journals and periods", "icon": "Landmark"},
    {"name": "Fixed Assets", "code": "fixed_assets", "description": "Asset tracking and depreciation", "icon": "Box"},
    {"name": "Tax & VAT", "code": "tax", "description": "Tax reporting and VAT returns", "icon": "Zap"},
    {"name": "Documents", "code": "documents", "description": "DMS and compliance documentation", "icon": "FileText"},
    {"name": "HR Management", "code": "hr", "description": "Employee records and departments", "icon": "UserCog"},
    {"name": "Agent Profiles", "code": "agents", "description": "Real estate agent specialized profiles", "icon": "Users"},
    {"name": "User Access Management", "code": "admin", "description": "Configure RBAC, module access and Segregation of Duties", "icon": "ShieldCheck"},
    {"name": "Payroll", "code": "payroll", "description": "Process employee salaries and agent commissions", "icon": "Banknote"},
]

ROLES = [
    {"name": "Super Admin", "role_type": "super_admin", "description": "Full system access"},
    {"name": "Administrator", "role_type": "admin", "description": "System administration"},
    {"name": "Executive", "role_type": "executive", "description": "Executive dashboards and reporting"},
    {"name": "Finance Manager", "role_type": "finance_manager", "description": "Full finance and reporting access"},
    {"name": "Sales Manager", "role_type": "sales_manager", "description": "Sales, CRM and commission management"},
    {"name": "Rental Manager", "role_type": "rental_manager", "description": "Leases, tenants and maintenance"},
    {"name": "Property Agent", "role_type": "agent", "description": "Property listings and CRM access"},
    {"name": "HR Manager", "role_type": "hr_manager", "description": "Employee and department management"},
    {"name": "Accountant", "role_type": "accountant", "description": "General ledger and accounting access"},
]

# Roles that get every module.
FULL_ACCESS_ROLES = ["super_admin", "admin", "executive"]

# Default module access for the remaining roles. Admins can change these in the
# UI afterwards; bootstrap only fills roles that have no modules yet, so it never
# overwrites a customised configuration.
DEFAULT_ROLE_MODULES = {
    "finance_manager": ["dashboard", "finance_ap", "finance_ar", "banking", "finance_gl", "fixed_assets", "tax", "commissions"],
    "sales_manager": ["dashboard", "crm", "properties", "sales", "agents"],
    "rental_manager": ["dashboard", "properties", "rentals", "documents"],
    "accountant": ["dashboard", "finance_ap", "finance_ar", "banking", "finance_gl", "tax"],
    "hr_manager": ["dashboard", "hr", "documents"],
    "agent": ["dashboard", "crm", "properties"],
}


@transaction.atomic
def seed_currencies() -> None:
    for code, name, symbol, is_base in CURRENCIES:
        _, created = Currency.objects.get_or_create(
            code=code, defaults={"name": name, "symbol": symbol, "is_base": is_base}
        )
        if created:
            logger.info("Created currency %s", code)


@transaction.atomic
def seed_modules() -> None:
    for data in MODULES:
        _, created = Module.objects.get_or_create(code=data["code"], defaults=data)
        if created:
            logger.info("Created module %s", data["code"])


@transaction.atomic
def seed_roles() -> None:
    for data in ROLES:
        Role.objects.get_or_create(role_type=data["role_type"], defaults=data)

    all_modules = list(Module.objects.all())
    for role in Role.objects.prefetch_related("modules"):
        if role.modules.exists():
            continue  # respect existing (possibly customised) access
        if role.role_type in FULL_ACCESS_ROLES:
            role.modules.set(all_modules)
        elif role.role_type in DEFAULT_ROLE_MODULES:
            role.modules.set(Module.objects.filter(code__in=DEFAULT_ROLE_MODULES[role.role_type]))
        logger.info("Assigned default modules to role %s", role.role_type)


def seed_number_sequences() -> None:
    NumberSequenceService.initialize_default_sequences()
