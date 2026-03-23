import os
import django
import sys
from decimal import Decimal

# Setup Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.payroll.models import TaxBracket, PayrollSetting
from apps.core.models import Currency

def seed_payroll_config():
    print("Seeding Payroll Configuration...")
    
    # 1. Get Currencies
    usd = Currency.objects.filter(code='USD').first()
    zig = Currency.objects.filter(code='ZWG').first()
    
    if not usd:
        print("USD currency not found, skipping USD brackets")
    else:
        # USD Brackets
        TaxBracket.objects.get_or_create(currency=usd, min_amount=0, max_amount=100, defaults={'tax_rate': 0, 'fixed_deduction': 0})
        TaxBracket.objects.get_or_create(currency=usd, min_amount=100.01, max_amount=300, defaults={'tax_rate': 20, 'fixed_deduction': 20})
        TaxBracket.objects.get_or_create(currency=usd, min_amount=300.01, max_amount=1000, defaults={'tax_rate': 25, 'fixed_deduction': 35})
        TaxBracket.objects.get_or_create(currency=usd, min_amount=1000.01, max_amount=2000, defaults={'tax_rate': 30, 'fixed_deduction': 85})
        TaxBracket.objects.get_or_create(currency=usd, min_amount=2000.01, max_amount=3000, defaults={'tax_rate': 35, 'fixed_deduction': 185})
        TaxBracket.objects.get_or_create(currency=usd, min_amount=3000.01, max_amount=None, defaults={'tax_rate': 40, 'fixed_deduction': 335})

    if not zig:
        print("ZWG currency not found, skipping ZWG brackets")
    else:
        # ZWG Brackets
        TaxBracket.objects.get_or_create(currency=zig, min_amount=0, max_amount=1356, defaults={'tax_rate': 0, 'fixed_deduction': 0})
        TaxBracket.objects.get_or_create(currency=zig, min_amount=1356.01, max_amount=4068, defaults={'tax_rate': 20, 'fixed_deduction': 271.20})
        TaxBracket.objects.get_or_create(currency=zig, min_amount=4068.01, max_amount=13560, defaults={'tax_rate': 25, 'fixed_deduction': 474.60})
        TaxBracket.objects.get_or_create(currency=zig, min_amount=13560.01, max_amount=27120, defaults={'tax_rate': 30, 'fixed_deduction': 1152.60})
        TaxBracket.objects.get_or_create(currency=zig, min_amount=27120.01, max_amount=40680, defaults={'tax_rate': 35, 'fixed_deduction': 2508.60})
        TaxBracket.objects.get_or_create(currency=zig, min_amount=40680.01, max_amount=None, defaults={'tax_rate': 40, 'fixed_deduction': 4542.60})

    # 2. Settings
    PayrollSetting.objects.update_or_create(key='aids_levy_rate', defaults={'name': 'AIDS Levy Rate', 'value': Decimal('0.03'), 'description': 'Percentage of PAYE'})
    PayrollSetting.objects.update_or_create(key='nssa_rate', defaults={'name': 'NSSA Rate', 'value': Decimal('0.045'), 'description': 'Percentage of Basic Salary'})
    PayrollSetting.objects.update_or_create(key='nssa_ceiling_usd', defaults={'name': 'NSSA Ceiling (USD)', 'value': Decimal('700.00')})
    PayrollSetting.objects.update_or_create(key='nssa_ceiling_zwg', defaults={'name': 'NSSA Ceiling (ZWG)', 'value': Decimal('24763.00')})

    print("Success: Payroll configuration seeded.")

if __name__ == "__main__":
    seed_payroll_config()
