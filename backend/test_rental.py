import os
import sys
import django
with open('test_rental.log', 'w') as f:
    sys.stdout = f
    sys.stderr = f
    
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()

    from apps.dashboard.views import RentalDashboardView
    from django.contrib.auth import get_user_model
    from rest_framework.test import APIRequestFactory, force_authenticate

    User = get_user_model()
    u = User.objects.filter(email__icontains='yolanda').first()
    if not u:
        u = User.objects.first()

    factory = APIRequestFactory()
    request = factory.get('/api/dashboard/rental/')
    force_authenticate(request, user=u)

    view = RentalDashboardView.as_view()
    try:
        response = view(request)
        print("STATUS", response.status_code)
        print("DATA", response.data)
    except Exception as e:
        import traceback
        traceback.print_exc()
