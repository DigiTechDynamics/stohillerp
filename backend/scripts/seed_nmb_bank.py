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
    print("Starting NMB Bank seeding (USD & ZiG)...")

    # 1. Ensure ZiG Currency exists
    zig, created = Currency.objects.get_or_create(
        code='ZiG',
        defaults={
            'name': 'Zimbabwe Gold',
            'symbol': 'ZiG',
            'is_base': False
        }
    )
    if created:
        print(f"Created Currency: {zig}")
    else:
        print(f"Currency exists: {zig}")

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

    # ZiG GL
    zig_gl, created = ChartOfAccount.objects.get_or_create(
        code='1040',
        defaults={
            'name': 'NMB Bank - ZiG',
            'account_type': 'asset',
            'account_sub_type': 'bank',
            'currency': zig,
            'description': 'Main ZiG Operating Account - Masvingo'
        }
    )
    if created:
        print(f"Created GL Account: {zig_gl}")
    else:
        print(f"GL Account exists: {zig_gl}")

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

    # NMB ZiG
    nmb_zig, created = BankAccount.objects.get_or_create(
        account_number='00000020141255',
        defaults={
            'name': 'NMB ZiG Current',
            'bank_name': 'NMB BANK',
            'branch_code': 'MASVINGO',
            'currency_id': 'ZiG',
            'account_type': 'cheque',
            'gl_account': zig_gl,
            'is_active': True
        }
    )
    if created:
        print(f"Created Bank Account: {nmb_zig}")
    else:
        print(f"Bank Account exists: {nmb_zig}")

    print("Seeding completed successfully.")

if __name__ == '__main__':
    seed_nmb_bank()
