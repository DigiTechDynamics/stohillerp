
import os
import django
import sys

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.core.models import Currency

def seed_currencies():
    print("Seeding Currencies (USD & ZiG only)...")
    
    # USD (Base reporting currency)
    usd, created = Currency.objects.get_or_create(
        code='USD',
        defaults={'name': 'United States Dollar', 'symbol': '$', 'is_base': True}
    )
    if not created and not usd.is_base:
        usd.is_base = True
        usd.save()
        print("Updated USD to Base")
    elif created:
        print("Created USD (Base)")

    # ZiG (Zimbabwe Gold)
    zig, created = Currency.objects.get_or_create(
        code='ZiG',
        defaults={'name': 'Zimbabwe Gold', 'symbol': 'ZiG', 'is_base': False}
    )
    if not created:
        print("ZiG already exists")
    else:
        print("Created ZiG")

    # Ensure ZAR and ZWL are gone (though the cleanup script should handle this,
    # it's good for the seed script to be clean)
    deleted_zar, _ = Currency.objects.filter(code='ZAR').delete()
    if deleted_zar:
        print("Removed ZAR from seed output.")
        
    deleted_zwl, _ = Currency.objects.filter(code='ZWL').delete()
    if deleted_zwl:
        print("Removed ZWL from seed output.")

if __name__ == '__main__':
    seed_currencies()
