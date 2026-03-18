import os
import django # type: ignore
import sys
from decimal import Decimal

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.finance.models import CustomerProfile, BankAccount # type: ignore
from apps.crm.models import Contact # type: ignore

try:
    contact = Contact.objects.get(first_name="Kevin", last_name="Laubscher")
    profile = CustomerProfile.objects.get(contact_link=contact)
    bank = BankAccount.objects.filter(is_active=True).first()
    
    print(f"PROFILE_ID: {profile.id}")
    print(f"BANK_ID: {bank.id if bank else 'None'}")
    print(f"BANK_NAME: {bank.name if bank else 'None'}")
    print(f"AR_ACCOUNT: {profile.ar_account.code}")

except Exception as e:
    print(f"Error: {str(e)}")
