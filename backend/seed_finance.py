import os
import sys
import django
from decimal import Decimal

# Setup Django environment
sys.path.append(os.path.abspath(os.path.dirname(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.finance.models import (
    Journal, ChartOfAccount, PostingProfile, FiscalYear, FiscalPeriod
)
from apps.core.models import Currency
from datetime import date, timedelta

def seed():
    print("--- Seeding Finance Module Data ---")
    
    # 1. Journals
    journals = [
        ('GJ', 'General Journal', 'General ledger manual adjustments', False),
        ('SAL', 'Sales Journal', 'Automated sales posting', True),
        ('PUR', 'Purchase Journal', 'Automated supplier invoice posting', True),
        ('BNK', 'Bank Journal', 'Bank statement transactions', True),
        ('CSH', 'Cash Journal', 'Petty cash transactions', False),
        ('PAY', 'Payroll Journal', 'Automated payroll posting', True),
    ]
    
    for code, name, desc, auto in journals:
        obj, created = Journal.objects.get_or_create(
            code=code,
            defaults={'name': name, 'description': desc, 'auto_posting': auto}
        )
        if created:
            print(f"Created Journal: {name}")
        else:
            print(f"Journal already exists: {name}")

    # 2. Posting Profile
    # Needs COA to exist
    usd = Currency.objects.filter(code='USD').first()
    if not usd:
        print("Missing USD currency. Please seed currencies first.")
        return

    # Look for or create core accounts
    def get_or_create_account(code, name, type, sub_type):
        obj, created = ChartOfAccount.objects.get_or_create(
            code=code,
            defaults={
                'name': name,
                'account_type': type,
                'account_sub_type': sub_type,
                'currency': usd,
                'is_active': True
            }
        )
        return obj

    # Asset Accounts
    ar = get_or_create_account('1200', 'Accounts Receivable', 'asset', 'receivable')
    bank = get_or_create_account('1000', 'Main Bank Account', 'asset', 'bank')
    
    # Liability Accounts
    ap = get_or_create_account('2100', 'Accounts Payable', 'liability', 'payable')
    vat = get_or_create_account('2200', 'VAT Payable', 'liability', 'tax_liability')
    
    # Equity
    retained = get_or_create_account('3000', 'Retained Earnings', 'equity', 'retained_earnings')
    
    # Revenue
    sales = get_or_create_account('4000', 'Service Revenue', 'revenue', 'operating_revenue')
    rental = get_or_create_account('4100', 'Rental Income', 'revenue', 'operating_revenue')
    
    # Expense
    cos = get_or_create_account('5000', 'Cost of Sales', 'expense', 'cost_of_sales')
    admin = get_or_create_account('5900', 'Administrative Expenses', 'expense', 'admin_expense')

    profile, created = PostingProfile.objects.get_or_create(
        name='Default Corporate Profile',
        defaults={
            'is_default': True,
            'bank_main': bank,
            'bank_trust': bank,
            'accounts_receivable': ar,
            'accounts_payable': ap,
            'vat_payable': vat,
            'vat_receivable': vat,
            'tenant_deposits': ap, # TODO: Separate deposit account
            'commission_receivable': ar,
            'commission_payable': ap,
            'retained_earnings': retained,
            'rental_income': rental,
            'commission_income': sales,
            'sale_revenue': sales,
            'cost_of_sales': cos,
            'commission_expense': cos,
            'property_inventory': ar # TODO: Separate inventory account
        }
    )
    if created:
        print(f"Created Default Posting Profile: {profile.name}")
    else:
        print(f"Posting Profile already exists.")

    # 3. Fiscal Year & Periods
    current_year = date.today().year
    fy_name = f"FY {current_year}/{str(current_year+1)[2:]}"
    fy, created = FiscalYear.objects.get_or_create(
        name=fy_name,
        defaults={
            'start_date': date(current_year, 3, 1),
            'end_date': date(current_year + 1, 2, 28 if (current_year+1)%4 != 0 else 29),
            'is_closed': False
        }
    )
    if created:
        print(f"Created Fiscal Year: {fy_name}")
        # Create 12 periods
        months = [
            ("March", 3), ("April", 4), ("May", 5), ("June", 6),
            ("July", 7), ("August", 8), ("September", 9), ("October", 10),
            ("November", 11), ("December", 12), ("January", 1), ("February", 2)
        ]
        for i, (m_name, m_num) in enumerate(months):
            y = current_year if m_num >= 3 else current_year + 1
            start = date(y, m_num, 1)
            # last day of month
            if m_num == 12:
                end = date(y, 12, 31)
            else:
                end = date(y, m_num + 1, 1) - timedelta(days=1)
            
            FiscalPeriod.objects.get_or_create(
                fiscal_year=fy,
                period_number=i + 1,
                defaults={
                    'name': f"{m_name} {y}",
                    'start_date': start,
                    'end_date': end,
                    'status': 'open'
                }
            )
        print(f"Created 12 Fiscal Periods for {fy_name}")
    else:
        print(f"Fiscal Year {fy_name} already exists.")

    print("--- Finance Seeding Complete ---")

if __name__ == "__main__":
    seed()
