import os
import django
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()
u = User.objects.filter(email__icontains='reilly').first()

res = {}
if u:
    res['email'] = u.email
    res['roles'] = [f"{r.name} ({r.role_type})" for r in u.roles.all()]
    res['modules'] = list(u.accessible_modules)

with open('reilly.json', 'w') as f:
    json.dump(res, f)
