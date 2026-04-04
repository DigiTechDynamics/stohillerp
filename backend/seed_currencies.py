
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
    if not created and not usd.is_base:
        usd.is_base = True
        usd.save()
        print("Updated USD to Base")
    elif created:
        print("Created USD (Base)")

    # ZAR
    zar, created = Currency.objects.get_or_create(
        code='ZAR',
        defaults={'name': 'South African Rand', 'symbol': 'R', 'is_base': False}
    )
    if not created and zar.is_base:
        zar.is_base = False
        zar.save()
        print("Updated ZAR to be non-base")
    elif created:
        print("Created ZAR")

if __name__ == '__main__':
    seed_currencies()
