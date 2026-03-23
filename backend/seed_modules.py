
import os
import django  # type: ignore

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()  # type: ignore

from apps.core.models import Module  # type: ignore

modules = [
    {'name': 'Command Center', 'code': 'dashboard', 'description': 'Main dashboard and executive overviews', 'icon': 'LayoutDashboard'},
    {'name': 'CRM Pipeline', 'code': 'crm', 'description': 'Leads, opportunities and contact management', 'icon': 'Users'},
    {'name': 'Properties', 'code': 'properties', 'description': 'Property inventory and details', 'icon': 'Building2'},
    {'name': 'Rental Management', 'code': 'rentals', 'description': 'Leases, tenants and maintenance', 'icon': 'Home'},
    {'name': 'Sales & Deals', 'code': 'sales', 'description': 'Transaction processing and sales tracking', 'icon': 'TrendingUp'},
    {'name': 'Accounts Payable', 'code': 'finance_ap', 'description': 'Supplier invoices and payments', 'icon': 'Briefcase'},
    {'name': 'Accounts Receivable', 'code': 'finance_ar', 'description': 'Customer invoices and receipts', 'icon': 'FileSearch'},
    {'name': 'Bank & Cash', 'code': 'banking', 'description': 'Bank accounts and statement reconciliation', 'icon': 'Landmark'},
    {'name': 'Commissions', 'code': 'commissions', 'description': 'Agent commission calculation and approval', 'icon': 'Award'},
    {'name': 'GL & Financial Control', 'code': 'finance_gl', 'description': 'General ledger, journals and periods', 'icon': 'Landmark'},
    {'name': 'Fixed Assets', 'code': 'fixed_assets', 'description': 'Asset tracking and depreciation', 'icon': 'Box'},
    {'name': 'Tax & VAT', 'code': 'tax', 'description': 'Tax reporting and VAT returns', 'icon': 'Zap'},
    {'name': 'Documents', 'code': 'documents', 'description': 'DMS and compliance documentation', 'icon': 'FileText'},
    {'name': 'HR Management', 'code': 'hr', 'description': 'Employee records and departments', 'icon': 'UserCog'},
    {'name': 'Agent Profiles', 'code': 'agents', 'description': 'Real estate agent specialized profiles', 'icon': 'Users'},
    {'name': 'User Access Management', 'code': 'admin', 'description': 'Configure RBAC, module access and Segregation of Duties', 'icon': 'ShieldCheck'},
    {'name': 'Payroll', 'code': 'payroll', 'description': 'Process employee salaries and agent commissions', 'icon': 'Banknote'},
]

for m in modules:
    obj, created = Module.objects.get_or_create(code=m['code'], defaults=m)
    if created:
        print(f"Created module: {m['name']}")
    else:
        print(f"Module already exists: {m['name']}")
