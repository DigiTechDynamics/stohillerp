import os
import django
import sys
from decimal import Decimal

# Set up Django
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from apps.dashboard.views import ExecutiveDashboardView
from rest_framework.test import APIRequestFactory
from apps.core.models import User

def test_dashboard():
    print("Testing Executive Dashboard View...")
    user = User.objects.filter(is_superuser=True).first()
    if not user:
        print("Error: No superuser found.")
        return

    factory = APIRequestFactory()
    request = factory.get('/api/v1/dashboard/executive/')
    
    from rest_framework.test import force_authenticate
    view = ExecutiveDashboardView.as_view()
    
    try:
        # Manually create request and force auth
        response = view(request) # This will fail auth if we don't fix it
        # Better:
        view_instance = ExecutiveDashboardView()
        view_instance.request = request
        force_authenticate(request, user=user)
        
        response = view_instance.get(request)
        if response.status_code == 200:
            print("Dashboard data fetched successfully!")
            import json
            print(json.dumps(response.data, indent=2))
        else:
            print(f"Dashboard failed with status {response.status_code}")
            print(response.data)
    except Exception as e:
        print("Exception occurred while fetching dashboard data:")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_dashboard()
