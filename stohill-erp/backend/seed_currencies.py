
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.core.models import Currency

def seed_currencies():
    # USD (Base reporting currency)
    usd, created = Currency.objects.get_or_create(
        code='USD',
        defaults={'name': 'United States Dollar', 'symbol': '$', 'is_base': True}
    )
    if created:
        print("Created USD (Base)")
    else:
        print("USD already exists")

    # ZAR
    zar, created = Currency.objects.get_or_create(
        code='ZAR',
        defaults={'name': 'South African Rand', 'symbol': 'R', 'is_base': False}
    )
    if created:
        print("Created ZAR")
    else:
        print("ZAR already exists")

if __name__ == '__main__':
    seed_currencies()
