
import os
import django  # type: ignore
import uuid

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.core.models import User, Role, Module, SODRule  # type: ignore

def test_rbac_and_sod():
    print("--- Starting RBAC & SOD Verification ---")
    
    # 1. Setup Modules
    m_finance, _ = Module.objects.get_or_create(code='finance_gl', defaults={'name': 'Finance GL'})
    m_banking, _ = Module.objects.get_or_create(code='banking', defaults={'name': 'Banking'})
    m_crm, _ = Module.objects.get_or_create(code='crm', defaults={'name': 'CRM'})
    
    # 2. Setup SOD Rule (Critical: Finance vs Banking)
    sod_rule, _ = SODRule.objects.update_or_create(
        module_a=m_finance,
        module_b=m_banking,
        defaults={
            'name': 'Finance vs Banking Conflict',
            'severity': SODRule.Severity.CRITICAL,
            'is_active': True,
            'description': 'Users cannot have both Finance and Banking access.'
        }
    )
    
    # 3. Create a Test Admin User
    u_raw = uuid.uuid4().hex
    u_hex = str(u_raw)
    u_short = u_hex[0:6]
    test_email = f"test_rbac_{u_short}@example.com"
    user = User.objects.create_user(
        email=test_email,
        password='testpassword123',
        first_name='Test',
        last_name='Access'
    )
    
    # Create an Admin Role with specific modules (Finance and CRM)
    role_admin, _ = Role.objects.get_or_create(
        role_type='admin_test',
        defaults={'name': 'Test Admin Role'}
    )
    role_admin.modules.set([m_finance, m_crm])
    user.roles.add(role_admin)
    
    print(f"User created: {test_email}")
    print(f"Assigned modules to role: {list(role_admin.modules.values_list('code', flat=True))}")
    
    # Test 1: RBAC Restriction (Admin should NOT see everything)
    accessible = user.accessible_modules
    print(f"Accessible modules (RBAC check): {accessible}")
    
    # Check that it doesn't have 'banking' yet
    if 'banking' in accessible:
        print("FAIL: User has access to banking which was not assigned.")
    else:
        print("PASS: User is restricted to assigned modules (and dashboard).")
        
    # Test 2: SOD Enforcement (Conflict Finance vs Banking)
    # Add a Banking role to trigger conflict
    role_banking, _ = Role.objects.get_or_create(
        role_type='banking_test',
        defaults={'name': 'Test Banking Role'}
    )
    role_banking.modules.set([m_banking])
    user.roles.add(role_banking)
    
    user.refresh_from_db()
    accessible_post_sod = user.accessible_modules
    print(f"Accessible modules after adding conflict (Banking): {accessible_post_sod}")
    
    if 'banking' in accessible_post_sod:
        print("FAIL: SOD Enforcement failed. Banking should be blocked by Finance rule.")
    elif 'finance_gl' in accessible_post_sod:
        print("PASS: SOD Enforcement worked. Banking was blocked because Finance is present.")
    else:
        print("WARNING: Both modules missing?")

    # Test 3: Conflict Reporting (check_sod_conflicts should still see it)
    conflicts = user.check_sod_conflicts()
    print(f"Reported conflicts: {conflicts}")
    if any(c['severity'] == SODRule.Severity.CRITICAL for c in conflicts):
        print("PASS: SOD Conflict still reported despite access being blocked.")
    else:
        print("FAIL: SOD Conflict not reported.")

    # Cleanup
    user.delete()
    print("--- Verification Complete ---")

if __name__ == "__main__":
    test_rbac_and_sod()
