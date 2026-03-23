
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.core.models import User, Role, Module, SODRule

def run_test():
    # 1. Get modules
    finance = Module.objects.get(code='finance_gl')
    banking = Module.objects.get(code='banking')
    
    # 2. Create an SOD Rule: Finance and Banking conflict
    rule, _ = SODRule.objects.get_or_create(
        name="Finance vs Banking",
        module_a=finance,
        module_b=banking,
        defaults={
            'severity': SODRule.Severity.CRITICAL,
            'description': "Users cannot have both Finance and Banking access."
        }
    )
    
    # 3. Create roles
    role_finance, _ = Role.objects.get_or_create(name="Finance Specialist", role_type="finance_admin")
    role_finance.modules.set([finance])
    
    role_banking, _ = Role.objects.get_or_create(name="Banking Auditor", role_type="banking_user")
    role_banking.modules.set([banking])
    
    # 4. Create a test user
    user, created = User.objects.get_or_create(
        email="sod_test@stohill.com",
        defaults={
            'first_name': "SOD",
            'last_name': "Tester",
            'is_active': True
        }
    )
    if created:
        user.set_password('password123')
        user.save()

    # 5. Assign both roles (Trigger conflict)
    user.roles.set([role_finance, role_banking])
    
    # 6. Check conflicts
    conflicts = user.check_sod_conflicts()
    print(f"\nUser: {user.email}")
    print(f"Modules: {user.accessible_modules}")
    print(f"Conflicts found: {len(conflicts)}")
    for c in conflicts:
        print(f" - [{c['severity'].upper()}] {c['rule']}: {c['description']}")
    
    if len(conflicts) > 0:
        print("\nSOD Validation: SUCCESS")
    else:
        print("\nSOD Validation: FAILED")

if __name__ == "__main__":
    run_test()
