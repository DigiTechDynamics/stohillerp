
import os
import django
import sys
import traceback

# Setup Django
sys.path.append('c:\\Users\\mkavh\\Desktop\\Digital Tech Dynamics\\Clients\\2026\\Stohil\\erp-master\\stohillerp-master\\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.crm.models import Opportunity
from apps.crm.views import OpportunityViewSet
from rest_framework.test import APIRequestFactory
from django.contrib.auth import get_user_model

try:
    User = get_user_model()
    user = User.objects.filter(is_superuser=True).first()
    factory = APIRequestFactory()
    request = factory.get('/api/v1/crm/opportunities/kanban/?is_lead=false')
    # Force authentication
    from rest_framework.test import force_authenticate
    force_authenticate(request, user=user)
    
    view = OpportunityViewSet.as_view({'get': 'kanban'})
    response = view(request)
    print(f"Status Code: {response.status_code}")
    if response.status_code == 500:
        print(f"Response Data: {response.data}")
except Exception:
    print(traceback.format_exc())
