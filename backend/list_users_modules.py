import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

users_data = []
for user in User.objects.all():
    users_data.append({
        "full_name": user.full_name,
        "email": user.email,
        "roles": [f"{r.name} ({r.role_type})" for r in user.roles.all()],
        "modules": list(user.accessible_modules)
    })

print(json.dumps(users_data, indent=2))
