import os
import django
import sys

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.core.models import Currency
from apps.finance.models.core import ChartOfAccount
from apps.finance.models.bank import BankAccount

def seed_nmb_bank():
    print("Starting NMB Bank seeding...")

    # 1. Ensure ZWL Currency exists
    zwl, created = Currency.objects.get_or_create(
        code='ZWL',
        defaults={
            'name': 'Zimbabwean Dollar',
            'symbol': 'Z$',
            'is_base': False
        }
    )
    if created:
        print(f"Created Currency: {zwl}")
    else:
        print(f"Currency exists: {zwl}")

    usd = Currency.objects.get(code='USD')

    # 2. Create GL Accounts
    # USD GL
    usd_gl, created = ChartOfAccount.objects.get_or_create(
        code='1030',
        defaults={
            'name': 'NMB Bank - USD',
            'account_type': 'asset',
            'account_sub_type': 'bank',
            'currency': usd,
            'description': 'Main USD Operating Account - Masvingo'
        }
    )
    if created:
        print(f"Created GL Account: {usd_gl}")
    else:
        print(f"GL Account exists: {usd_gl}")

    # ZWL GL
    zwl_gl, created = ChartOfAccount.objects.get_or_create(
        code='1040',
        defaults={
            'name': 'NMB Bank - ZWL',
            'account_type': 'asset',
            'account_sub_type': 'bank',
            'currency': zwl,
            'description': 'Main ZWL Operating Account - Masvingo'
        }
    )
    if created:
        print(f"Created GL Account: {zwl_gl}")
    else:
        print(f"GL Account exists: {zwl_gl}")

    # 3. Create BankAccount Records
    # NMB USD
    nmb_usd, created = BankAccount.objects.get_or_create(
        account_number='00000021087758',
        defaults={
            'name': 'NMB USD Current',
            'bank_name': 'NMB BANK',
            'branch_code': 'MASVINGO',
            'currency_id': 'USD',
            'account_type': 'cheque',
            'gl_account': usd_gl,
            'is_active': True
        }
    )
    if created:
        print(f"Created Bank Account: {nmb_usd}")
    else:
        print(f"Bank Account exists: {nmb_usd}")

    # NMB ZWL
    nmb_zwl, created = BankAccount.objects.get_or_create(
        account_number='00000020141255',
        defaults={
            'name': 'NMB ZWL Current',
            'bank_name': 'NMB BANK',
            'branch_code': 'MASVINGO',
            'currency_id': 'ZWL',
            'account_type': 'cheque',
            'gl_account': zwl_gl,
            'is_active': True
        }
    )
    if created:
        print(f"Created Bank Account: {nmb_zwl}")
    else:
        print(f"Bank Account exists: {nmb_zwl}")

    print("Seeding completed successfully.")

if __name__ == '__main__':
    seed_nmb_bank()
