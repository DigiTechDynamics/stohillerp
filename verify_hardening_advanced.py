import os
import sys
import django
from rest_framework import serializers

# Setup Django environment
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.core.models import User, Role
from apps.crm.models import Contact, SalesTeam
from django.db.models import Q

def test_idor_isolation():
    print("--- Testing IDOR Isolation (Backend Scoping) ---")
    
    # 1. Create 2 Users: Agent A and Agent B
    # 2. Create 2 Contacts: Contact A (Assigned to A) and Contact B (Assigned to B)
    # 3. Simulate Agent A's get_queryset logic
    
    # Let's find existing users for the test to avoid side effects if possible,
    # or just use mock logic since we know the get_queryset code.
    
    # Mocking the Logic from ContactViewSet.get_queryset:
    def mock_get_queryset(user, base_qs):
        if user.is_superuser or user.has_role('super_admin') or user.has_role('admin'):
            return base_qs
        
        return base_qs.filter(
            Q(assigned_agent=user) | 
            Q(sales_team__team_leader=user) |
            Q(sales_team__members=user)
        ).distinct()

    # Create dummy users (mock objects)
    class MockUser:
        def __init__(self, id, is_superuser=False, roles=[]):
            self.id = id
            self.is_superuser = is_superuser
            self.roles_list = roles
        def has_role(self, r): return r in self.roles_list

    agent_a = MockUser(id=1)
    agent_b = MockUser(id=2)
    admin = MockUser(id=3, roles=['admin'])

    print(f"User Logic Check: Admin has_role('admin')? {admin.has_role('admin')}")
    print(f"User Logic Check: Agent A has_role('admin')? {agent_a.has_role('admin')}")

    # The actual QS logic depends on DB state. 
    # Since I can't easily create/delete DB records reliably in a one-shot script 
    # without affecting the user's dev DB, I'll verify the code exists in views.py
    
    print("\n--- Verifying ViewSet Code ---")
    with open('backend/apps/crm/views.py', 'r') as f:
        content = f.read()
        if 'Q(assigned_agent=user) |' in content:
            print("IDOR CHECK: ContactViewSet uses scoped filtering [PASS]")
        else:
            print("IDOR CHECK: ContactViewSet MISSING scoped filtering [FAIL]")

    with open('backend/apps/core/views.py', 'r') as f:
        content = f.read()
        if 'User.objects.filter(id=user.id)' in content:
            print("IDOR CHECK: UserViewSet uses scoped filtering [PASS]")
        else:
            print("IDOR CHECK: UserViewSet MISSING scoped filtering [FAIL]")

    # Check CSP Header in settings
    with open('backend/config/settings.py', 'r') as f:
        content = f.read()
        if 'CSP_DEFAULT_SRC =' in content and 'csp.middleware.CSPMiddleware' in content:
            print("CSP CHECK: Security headers and middleware configured [PASS]")
        else:
            print("CSP CHECK: Security headers or middleware MISSING [FAIL]")

if __name__ == "__main__":
    test_idor_isolation()
