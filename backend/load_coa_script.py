import os
import django
import sys

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.finance.models.core import ChartOfAccount
from apps.core.models import Currency

def run():
    # Make sure we have a base currency just in case, usually USD.
    currency, created = Currency.objects.get_or_create(
        code="USD",
        defaults={"name": "US Dollar", "symbol": "$"}
    )

    accounts_data = [
        # ASSETS
        {'code': '1100', 'name': 'Cash and bank balances', 'type': 'asset', 'sub_type': 'bank'},
        {'code': '1110', 'name': 'Short-term investments', 'type': 'asset', 'sub_type': 'investment'},
        {'code': '1200', 'name': 'Accounts receivable', 'type': 'asset', 'sub_type': 'receivable'},
        {'code': '1210', 'name': 'Inventory (held for sale)', 'type': 'asset', 'sub_type': 'current_asset'},
        {'code': '1211', 'name': 'Inventory - Completed properties', 'type': 'asset', 'sub_type': 'current_asset', 'parent_code': '1210'},
        {'code': '1212', 'name': 'Inventory - Land held for sale', 'type': 'asset', 'sub_type': 'current_asset', 'parent_code': '1210'},
        {'code': '1220', 'name': 'Inventory - Construction materials', 'type': 'asset', 'sub_type': 'current_asset'},
        {'code': '1300', 'name': 'Security deposits receivable', 'type': 'asset', 'sub_type': 'receivable'},
        {'code': '1400', 'name': 'Prepaid expenses', 'type': 'asset', 'sub_type': 'current_asset'},
        {'code': '1500', 'name': 'Deposits paid', 'type': 'asset', 'sub_type': 'current_asset'},
        # Non-Current Assets
        {'code': '1600', 'name': 'Investment properties', 'type': 'asset', 'sub_type': 'fixed_asset'},
        {'code': '1610', 'name': 'Investment properties - held for rent', 'type': 'asset', 'sub_type': 'fixed_asset', 'parent_code': '1600'},
        {'code': '1620', 'name': 'Investment properties - under development', 'type': 'asset', 'sub_type': 'fixed_asset', 'parent_code': '1600'},
        {'code': '1700', 'name': 'Property development assets', 'type': 'asset', 'sub_type': 'fixed_asset'},
        {'code': '1710', 'name': 'Construction in progress (CIP)', 'type': 'asset', 'sub_type': 'fixed_asset', 'parent_code': '1700'},
        {'code': '1720', 'name': 'Land held for development', 'type': 'asset', 'sub_type': 'fixed_asset', 'parent_code': '1700'},
        {'code': '1800', 'name': 'Property, plant and equipment (PPE)', 'type': 'asset', 'sub_type': 'fixed_asset'},
        {'code': '1900', 'name': 'Accumulated depreciation - PPE', 'type': 'contra', 'sub_type': 'fixed_asset'},

        # LIABILITIES
        {'code': '2100', 'name': 'Accounts payable', 'type': 'liability', 'sub_type': 'payable'},
        {'code': '2200', 'name': 'Tenant deposits', 'type': 'liability', 'sub_type': 'current_liability'},
        {'code': '2300', 'name': 'Accrued expenses', 'type': 'liability', 'sub_type': 'current_liability'},
        {'code': '2400', 'name': 'Deferred revenue', 'type': 'liability', 'sub_type': 'current_liability'},
        {'code': '2600', 'name': 'Taxes payable', 'type': 'liability', 'sub_type': 'tax_liability'},
        {'code': '2700', 'name': 'Commission payable', 'type': 'liability', 'sub_type': 'payable'},
        {'code': '2800', 'name': 'Trust liabilities', 'type': 'liability', 'sub_type': 'current_liability'},
        {'code': '2900', 'name': 'Other liabilities', 'type': 'liability', 'sub_type': 'current_liability'},
        {'code': '2910', 'name': 'Current portion of bank loans', 'type': 'liability', 'sub_type': 'current_liability', 'parent_code': '2900'},
        # Non-Current Liabilities
        {'code': '2500', 'name': 'Bank loans and borrowings', 'type': 'liability', 'sub_type': 'long_term_liability'},
        {'code': '2510', 'name': 'Mortgage bonds', 'type': 'liability', 'sub_type': 'long_term_liability', 'parent_code': '2500'},
        {'code': '2520', 'name': 'Finance lease obligations', 'type': 'liability', 'sub_type': 'long_term_liability', 'parent_code': '2500'},
        {'code': '2530', 'name': 'Other long-term borrowings', 'type': 'liability', 'sub_type': 'long_term_liability', 'parent_code': '2500'},
        {'code': '2540', 'name': 'Deferred tax liabilities', 'type': 'liability', 'sub_type': 'tax_liability'},

        # EQUITY
        {'code': '3100', 'name': 'Share capital', 'type': 'equity', 'sub_type': 'share_capital'},
        {'code': '3200', 'name': 'Retained earnings', 'type': 'equity', 'sub_type': 'retained_earnings'},
        {'code': '3300', 'name': 'Revaluation reserves', 'type': 'equity', 'sub_type': 'retained_earnings'},

        # INCOME / REVENUE
        {'code': '4100', 'name': 'Rental income', 'type': 'revenue', 'sub_type': 'operating_revenue'},
        {'code': '4200', 'name': 'Property management fees', 'type': 'revenue', 'sub_type': 'operating_revenue'},
        {'code': '4300', 'name': 'Commission income', 'type': 'revenue', 'sub_type': 'operating_revenue'},
        {'code': '4400', 'name': 'Service charge income', 'type': 'revenue', 'sub_type': 'operating_revenue'},
        {'code': '4500', 'name': 'Property sales revenue', 'type': 'revenue', 'sub_type': 'operating_revenue'},
        {'code': '4600', 'name': 'Other income', 'type': 'revenue', 'sub_type': 'other_income'},

        # COST OF SALES / DEVELOPMENT COSTS
        {'code': '5100', 'name': 'Cost of property sales', 'type': 'expense', 'sub_type': 'cost_of_sales'},
        {'code': '5110', 'name': 'Cost of land', 'type': 'expense', 'sub_type': 'cost_of_sales', 'parent_code': '5100'},
        {'code': '5120', 'name': 'Construction costs', 'type': 'expense', 'sub_type': 'cost_of_sales', 'parent_code': '5100'},
        {'code': '5200', 'name': 'Development project costs', 'type': 'expense', 'sub_type': 'cost_of_sales'},
        {'code': '5210', 'name': 'Contractor/subcontractor costs', 'type': 'expense', 'sub_type': 'cost_of_sales', 'parent_code': '5200'},
        {'code': '5220', 'name': 'Materials and supplies', 'type': 'expense', 'sub_type': 'cost_of_sales', 'parent_code': '5200'},
        {'code': '5230', 'name': 'Direct project expenses', 'type': 'expense', 'sub_type': 'cost_of_sales', 'parent_code': '5200'},
        {'code': '5240', 'name': 'Direct cost of income earned', 'type': 'expense', 'sub_type': 'cost_of_sales', 'parent_code': '5200'},

        # OPERATING EXPENSES
        {'code': '6100', 'name': 'Property maintenance expense', 'type': 'expense', 'sub_type': 'operating_expense'},
        {'code': '6110', 'name': 'Repairs and maintenance', 'type': 'expense', 'sub_type': 'operating_expense', 'parent_code': '6100'},
        {'code': '6120', 'name': 'Security services', 'type': 'expense', 'sub_type': 'operating_expense', 'parent_code': '6100'},
        {'code': '6130', 'name': 'Municipal property rates', 'type': 'expense', 'sub_type': 'operating_expense', 'parent_code': '6100'},
        {'code': '6140', 'name': 'Utilities expense', 'type': 'expense', 'sub_type': 'operating_expense', 'parent_code': '6100'},
        {'code': '6141', 'name': 'Electricity', 'type': 'expense', 'sub_type': 'operating_expense', 'parent_code': '6140'},

        {'code': '6200', 'name': 'Staff costs', 'type': 'expense', 'sub_type': 'admin_expense'},
        {'code': '6210', 'name': 'Salaries and wages', 'type': 'expense', 'sub_type': 'admin_expense', 'parent_code': '6200'},
        {'code': '6220', 'name': 'Payroll taxes', 'type': 'expense', 'sub_type': 'admin_expense', 'parent_code': '6200'},
        {'code': '6230', 'name': 'Commission paid', 'type': 'expense', 'sub_type': 'admin_expense', 'parent_code': '6200'},
        {'code': '6240', 'name': 'Groceries', 'type': 'expense', 'sub_type': 'admin_expense', 'parent_code': '6200'},

        {'code': '6300', 'name': 'Administrative expenses', 'type': 'expense', 'sub_type': 'admin_expense'},
        {'code': '6310', 'name': 'Office supplies', 'type': 'expense', 'sub_type': 'admin_expense', 'parent_code': '6300'},
        {'code': '6320', 'name': 'Professional fees', 'type': 'expense', 'sub_type': 'admin_expense', 'parent_code': '6300'},
        {'code': '6330', 'name': 'Audit fees', 'type': 'expense', 'sub_type': 'admin_expense', 'parent_code': '6300'},
        {'code': '6340', 'name': 'Insurance expense', 'type': 'expense', 'sub_type': 'admin_expense', 'parent_code': '6300'},
        {'code': '6350', 'name': 'Marketing and advertising expense', 'type': 'expense', 'sub_type': 'admin_expense', 'parent_code': '6300'},
        {'code': '6360', 'name': 'Subscriptions', 'type': 'expense', 'sub_type': 'admin_expense', 'parent_code': '6300'},
        {'code': '6370', 'name': 'Fuel and travelling', 'type': 'expense', 'sub_type': 'admin_expense', 'parent_code': '6300'},
        {'code': '6380', 'name': 'Bank charges', 'type': 'expense', 'sub_type': 'admin_expense', 'parent_code': '6300'},
        {'code': '6390', 'name': 'Internet', 'type': 'expense', 'sub_type': 'admin_expense', 'parent_code': '6300'},
        {'code': '6395', 'name': 'Telephone expense', 'type': 'expense', 'sub_type': 'admin_expense', 'parent_code': '6300'},

        {'code': '6400', 'name': 'Depreciation', 'type': 'expense', 'sub_type': 'depreciation'},
        {'code': '6410', 'name': 'Depreciation - PPE', 'type': 'expense', 'sub_type': 'depreciation', 'parent_code': '6400'},
        {'code': '6420', 'name': 'Depreciation - investment property', 'type': 'expense', 'sub_type': 'depreciation', 'parent_code': '6400'},
    ]

    # Create them but delay parent linkage
    print("Creating accounts...")
    accounts_created = 0
    accounts_updated = 0
    
    # Pass 1: create or update accounts
    for data in accounts_data:
        acc, created = ChartOfAccount.objects.update_or_create(
            code=data['code'],
            defaults={
                'name': data['name'],
                'account_type': data['type'],
                'account_sub_type': data['sub_type'],
                'currency': currency,
                'allow_manual_entry': True,
                'is_active': True,
            }
        )
        if created:
            accounts_created += 1
        else:
            accounts_updated += 1
            
    # Pass 2: setup parents
    print("Setting up parent-child relationships...")
    for data in accounts_data:
        if 'parent_code' in data and data['parent_code']:
            child = ChartOfAccount.objects.get(code=data['code'])
            parent = ChartOfAccount.objects.get(code=data['parent_code'])
            child.parent = parent
            child.allow_direct_posting = True
            child.save()
            
            # Optionally set parent allow_direct_posting to False? 
            # In many systems parents are header accounts.
            parent.allow_direct_posting = False
            parent.save()
            
    print(f"Done. Created {accounts_created}, Updated {accounts_updated} accounts.")

if __name__ == '__main__':
    run()
