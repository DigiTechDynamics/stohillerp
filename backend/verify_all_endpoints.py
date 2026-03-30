
import os
import django
import sys
import traceback

sys.path.append('c:\\Users\\mkavh\\Desktop\\Digital Tech Dynamics\\Clients\\2026\\Stohil\\erp-master\\stohillerp-master\\backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.urls import get_resolver
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

User = get_user_model()
admin_user = User.objects.filter(is_superuser=True).first()

if not admin_user:
    print("No superuser found.")
    sys.exit(1)

client = APIClient()
client.force_authenticate(user=admin_user)

resolver = get_resolver()
all_urls = set()

def extract_urls(urlpatterns, prefix=''):
    for pattern in urlpatterns:
        if hasattr(pattern, 'url_patterns'):
            extract_urls(pattern.url_patterns, prefix + str(pattern.pattern))
        else:
            url = prefix + str(pattern.pattern)
            # Just simple formatting to drop regex chars
            url = url.replace('^', '').replace('$', '')
            
            # Skip paths that require parameters for a simple GET check, except if we can fake them
            if '<' in url or '(?P' in url:
                continue
            
            if url.startswith('api/') or url.startswith('/api/'):
                all_urls.add('/' + url if not url.startswith('/') else url)

extract_urls(resolver.url_patterns)

broken = []
for url in sorted(list(all_urls)):
    if 'schema' in url or 'swagger' in url or url.endswith('format='):
        continue
    try:
        response = client.get(url)
        if response.status_code >= 500:
            broken.append((url, response.status_code))
            print(f"BROKEN [500]: {url}")
        elif response.status_code == 404:
            # Maybe the regex wasn't matched properly or endpoint expects PK
            pass
        else:
            status = response.status_code
            print(f"OK [{status}]: {url}")
    except Exception as e:
        broken.append((url, str(e)))
        print(f"ERROR: {url} -> {e}")

if broken:
    print("\n--- BROKEN PATHS FOUND ---")
    for b in broken:
        print(b)
else:
    print("\nAll tested API paths returned valid status codes (no 500s).")
