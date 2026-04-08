import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.dashboard.views import FinanceDashboardView
from django.contrib.auth import get_user_model
from rest_framework.test import APIRequestFactory

User = get_user_model()
u = User.objects.filter(email__icontains='tinotenda').first()

factory = APIRequestFactory()
request = factory.get('/api/dashboard/finance/')
from rest_framework.request import Request
drf_request = Request(request)
drf_request.user = u

view = FinanceDashboardView.as_view()
try:
    response = view(request)
    print("STATUS", response.status_code)
    print("DATA", response.data)
except Exception as e:
    import traceback
    traceback.print_exc()
