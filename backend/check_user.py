import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

users = User.objects.filter(username__icontains='tinotenda')
if not users.exists():
    users = User.objects.filter(first_name__icontains='tinotenda')
    
for u in users:
    print(f"User: {u.username}, Email: {u.email}, Is Active: {u.is_active}")
    print(f"Roles: {[r.role_type for r in u.roles.all()]}")
