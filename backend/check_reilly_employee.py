import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
from apps.hr.models import Employee

User = get_user_model()
u = User.objects.filter(email__icontains='reilly').first()

if u:
    print(f"User: {u.email}")
    employee = getattr(u, 'employee', None)
    if employee:
        print(f"Employee found: {employee.full_name}, ID: {employee.id}")
    else:
        print("No employee profile found for Reilly.")
else:
    print("User Reilly not found.")
