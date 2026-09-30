"""
Server-side module access control.

Roles grant modules (core.Module codes); ``User.accessible_modules`` resolves
them and removes modules blocked by critical SoD rules. Before this existed the
module list only filtered the sidebar, so any authenticated user could call any
endpoint directly (post journals, unlock periods, read payroll).

The policy is keyed by URL prefix under /api/v1/. Each entry lists the modules
that may read (safe methods) and the modules that may write. Reads are wider
than writes because forms in one module look up records owned by another
(a lease form picks a tenant from CRM and a property from Properties).
The longest matching prefix wins. A path with no entry is refused.
"""

from rest_framework.permissions import SAFE_METHODS, BasePermission

API_PREFIX = "/api/v1/"

ANY = None  # any authenticated user

ADMIN = {"admin"}
GL = {"finance_gl"}
FINANCE = {"finance_gl", "finance_ap", "finance_ar", "banking", "tax", "fixed_assets"}

# prefix: (read_modules, write_modules)
POLICY = {
    # Auth and health are public or self-service; views set their own permissions.
    "auth/": (ANY, ANY),
    "health/": (ANY, ANY),

    "dashboard/": (ANY, ANY),

    "core/me/": (ANY, ANY),
    "core/currencies/": (ANY, ADMIN | GL),
    "core/data/template/": (ANY, ANY),
    "core/": (ADMIN, ADMIN),  # users, roles, modules, SoD rules, audit log, import/export

    "crm/contacts/": ({"crm", "rentals", "sales", "properties", "documents", "commissions"} | FINANCE,
                      {"crm", "rentals", "sales"}),
    "crm/contact-documents/": ({"crm", "rentals", "sales", "documents"}, {"crm", "rentals", "sales", "documents"}),
    # Activity timelines and notes appear on tenant and deal panels too.
    "crm/activities/": ({"crm", "sales", "rentals", "properties"}, {"crm", "sales", "rentals"}),
    "crm/notes/": ({"crm", "sales", "rentals", "properties"}, {"crm", "sales", "rentals"}),
    "crm/": ({"crm", "sales", "rentals", "properties"}, {"crm"}),

    "properties/": ({"properties", "crm", "rentals", "sales", "documents", "commissions"} | FINANCE,
                    {"properties"}),
    "sales/": ({"sales", "crm", "commissions", "finance_ar", "finance_gl"}, {"sales"}),
    # Owner balances are trust money: rental staff see them, finance pays them out.
    "rentals/owners/": ({"rentals", "properties", "finance_ap", "finance_gl"}, {"finance_ap", "finance_gl"}),
    "rentals/": ({"rentals", "properties", "finance_ar", "finance_gl"}, {"rentals"}),
    "commissions/": ({"commissions", "sales", "payroll", "finance_gl", "finance_ap"}, {"commissions"}),
    # Supporting documents (e.g. supplier invoice scans) are uploaded from finance too.
    "documents/": ({"documents", "crm", "rentals", "sales", "properties", "hr"} | FINANCE,
                   {"documents", "crm", "rentals", "sales", "properties", "hr"} | FINANCE),
    "hr/": ({"hr", "payroll", "agents", "crm", "sales", "rentals", "properties", "commissions"},
            {"hr", "agents"}),
    "payroll/": ({"payroll"}, {"payroll"}),
    "banking/": ({"banking", "finance_gl"}, {"banking", "finance_gl"}),
    "fixed-assets/": ({"fixed_assets", "finance_gl"}, {"fixed_assets"}),

    # Finance sub-areas
    "finance/suppliers/": ({"finance_ap", "finance_gl", "payroll"}, {"finance_ap"}),
    "finance/supplier-invoices/": ({"finance_ap", "finance_gl", "payroll"}, {"finance_ap"}),
    "finance/supplier-payments/": ({"finance_ap", "finance_gl", "banking"}, {"finance_ap"}),
    "finance/customers/": ({"finance_ar", "finance_gl", "rentals", "sales"}, {"finance_ar"}),
    "finance/customer-invoices/": ({"finance_ar", "finance_gl", "rentals", "sales"}, {"finance_ar"}),
    "finance/customer-receipts/": ({"finance_ar", "finance_gl", "rentals"}, {"finance_ar"}),
    "finance/bank-accounts/": (FINANCE | {"rentals", "payroll"}, {"banking", "finance_gl"}),
    "finance/tax-codes/": (FINANCE, {"tax", "finance_gl"}),
    "finance/reports/vat-return/": ({"tax", "finance_gl"}, {"tax", "finance_gl"}),
    "finance/reports/export/vat-return/": ({"tax", "finance_gl"}, {"tax", "finance_gl"}),
    "finance/approval-rules/": (FINANCE, GL | {"admin"}),
    "finance/cost-centers/": (FINANCE | {"payroll", "properties"}, GL),
    "finance/ar-allocations/":({"finance_ar", "finance_gl", "rentals"}, set()),
    "finance/ap-allocations/": ({"finance_ap", "finance_gl"}, set()),
    "finance/reports/ar-aging/": ({"finance_ar", "finance_gl"}, set()),
    "finance/reports/ap-aging/": ({"finance_ap", "finance_gl"}, set()),
    "finance/currencies/": (ANY, GL),
    "finance/exchange-rates/": (ANY, GL),
    "finance/accounts/": (FINANCE | {"payroll"}, GL),
    "finance/account-search/": (FINANCE | {"payroll"}, GL),
    "finance/journals/": (FINANCE | {"payroll"}, GL),
    "finance/summary/": (FINANCE, set()),
    # Posting, approving, locking and closing stay with the GL module; the
    # other finance areas may look entries and periods up.
    "finance/entries/": (FINANCE, GL),
    "finance/transactions/": (FINANCE, GL),
    "finance/periods/": (FINANCE | {"payroll"}, GL),
    "finance/fiscal-years/": (FINANCE | {"payroll"}, GL),
    "finance/": (GL, GL),  # entries, batches, periods, fiscal years, posting profiles, reports, budgets
}

# Longest prefix first so specific entries win over their parents.
_ORDERED = sorted(POLICY.items(), key=lambda kv: len(kv[0]), reverse=True)


def resolve_policy(path):
    """Return (read_modules, write_modules) for a request path, or None if unmapped."""
    if not path.startswith(API_PREFIX):
        return None
    rel = path[len(API_PREFIX):]
    for prefix, rule in _ORDERED:
        if rel.startswith(prefix):
            return rule
    return None


def user_modules(user):
    """accessible_modules costs a few queries; cache it on the user for the request."""
    cached = getattr(user, "_module_cache", None)
    if cached is None:
        cached = set(user.accessible_modules)
        user._module_cache = cached
    return cached


class HasModuleAccess(BasePermission):
    message = "Your roles do not grant access to this module."

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        rule = resolve_policy(request.path)
        if rule is None:
            return False
        read_modules, write_modules = rule
        allowed = read_modules if request.method in SAFE_METHODS else write_modules
        if allowed is ANY:
            return True
        return bool(user_modules(user) & allowed)
