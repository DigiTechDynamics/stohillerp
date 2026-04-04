import os
import django
import sys

# Setup Django
sys.path.append(os.path.join(os.getcwd(), 'backend'))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.core.models import User
from rest_framework.test import APIRequestFactory, force_authenticate
from backend.utils.permissions import ExecutiveModePermission
from apps.crm.views import OpportunityViewSet
from rest_framework import status

def verify_executive_mode():
    factory = APIRequestFactory()
    permission = ExecutiveModePermission()
    
    # Create a test user with executive_mode = False
    user = User.objects.filter(is_superuser=True).first()
    if not user:
        print("No superuser found for testing.")
        return
        
    user.executive_mode = False
    user.save()
    
    print(f"Testing with user: {user.email}, Executive Mode: {user.executive_mode}")
    
    # Simulate a POST request to CRM
    request = factory.post('/api/v1/crm/opportunities/', {'title': 'Hack Deal'})
    request.user = user # Manually set for direct permission check
    
    # Check permission directly
    has_perm = permission.has_permission(request, None)
    print(f"POST Permission (Expected False): {has_perm}")
    
    # Simulate a GET request (SAFE_METHODS)
    request_get = factory.get('/api/v1/crm/opportunities/')
    request_get.user = user
    has_perm_get = permission.has_permission(request_get, None)
    print(f"GET Permission (Expected True): {has_perm_get}")
    
    # Test an EXEMPT path
    request_me = factory.patch('/api/v1/core/me/', {'first_name': 'Test'})
    request_me.user = user
    has_perm_me = permission.has_permission(request_me, None)
    print(f"PATCH /me/ Permission (Expected True - Exempt): {has_perm_me}")

    if not has_perm and has_perm_get and has_perm_me:
        print("\n✅ VERIFICATION SUCCESSFUL: Executive Mode enforcement is working correctly.")
    else:
        print("\n❌ VERIFICATION FAILED: Enforcement logic issues detected.")

if __name__ == "__main__":
    verify_executive_mode()
