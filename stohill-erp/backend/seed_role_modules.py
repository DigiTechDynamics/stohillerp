
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.core.models import Role, Module

# All modules
all_modules = list(Module.objects.all())

# Roles that should have everything by default
high_privilege_roles = ['super_admin', 'admin', 'executive']

for role_type in high_privilege_roles:
    role = Role.objects.filter(role_type=role_type).first()
    if role:
        role.modules.set(all_modules)
        print(f"Assigned all modules to role: {role.name} ({role_type})")
    else:
        print(f"Role not found: {role_type}")

# Specific mappings for other roles as examples
standard_mappings = {
    'finance_manager': ['dashboard', 'finance_ap', 'finance_ar', 'banking', 'finance_gl', 'fixed_assets', 'tax', 'commissions'],
    'sales_manager': ['dashboard', 'crm', 'properties', 'sales', 'agents'],
    'rental_manager': ['dashboard', 'properties', 'rentals', 'documents'],
    'accountant': ['dashboard', 'finance_ap', 'finance_ar', 'banking', 'finance_gl', 'tax'],
    'hr_manager': ['dashboard', 'hr', 'documents'],
}

for role_type, module_codes in standard_mappings.items():
    role = Role.objects.filter(role_type=role_type).first()
    if role:
        modules = Module.objects.filter(code__in=module_codes)
        role.modules.set(modules)
        print(f"Assigned {modules.count()} modules to role: {role.name} ({role_type})")
