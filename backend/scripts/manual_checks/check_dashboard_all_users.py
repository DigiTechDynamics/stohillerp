import os
import django
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from rest_framework.test import APIRequestFactory, force_authenticate
from apps.dashboard.views import ExecutiveDashboardView, AgentDashboardView
from apps.core.models import User

def main():
    factory = APIRequestFactory()
    print('Testing all users...')
    errors = 0
    exec_view = ExecutiveDashboardView.as_view()
    agent_view = AgentDashboardView.as_view()
    
    for u in User.objects.all():
        print(f'User: {u.email}')
        
        # Test Executive Dashboard
        req = factory.get('/api/v1/dashboard/executive/')
        force_authenticate(req, user=u)
        try:
            res = exec_view(req)
            if res.status_code >= 500:
                print(f'  => Executive 500: {u.email}')
                print(res.data)
                errors += 1
        except Exception as e:
            print(f'  => Executive crash: {u.email} -> {e}')
            import traceback
            traceback.print_exc()
            errors += 1
            
        # Test Agent Dashboard
        req = factory.get('/api/v1/dashboard/agent/')
        force_authenticate(req, user=u)
        try:
            res = agent_view(req)
            if res.status_code >= 500:
                print(f'  => Agent 500: {u.email}')
                print(res.data)
                errors += 1
        except Exception as e:
            print(f'  => Agent crash: {u.email} -> {e}')
            import traceback
            traceback.print_exc()
            errors += 1
            
    print(f'Total errors: {errors}')

if __name__ == '__main__':
    main()
