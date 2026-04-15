import os
import django
import sys

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.finance.models.core import ChartOfAccount, PostingProfile

def run():
    print("Aligning modules to new Chart of Accounts...")
    
    # helper to fetch by code
    def get_acc(code):
        try:
            return ChartOfAccount.objects.get(code=code)
        except ChartOfAccount.DoesNotExist:
            print(f"Error: Account {code} not found in database!")
            return None

    # Fetch needed accounts
    bank_main = get_acc('1100')
    bank_trust = get_acc('1100')
    accounts_receivable = get_acc('1200')
    commission_receivable = get_acc('1200')
    
    accounts_payable = get_acc('2100')
    vat_payable = get_acc('2600')
    vat_receivable = get_acc('2600') # Mapped to same liability as per models limit_choices_to
    tenant_deposits = get_acc('2200')
    commission_payable = get_acc('2700')
    
    retained_earnings = get_acc('3200')
    
    rental_income = get_acc('4100')
    commission_income = get_acc('4300')
    sale_revenue = get_acc('4500')
    
    cost_of_sales = get_acc('5100')
    commission_expense = get_acc('6230')
    
    property_inventory = get_acc('1210')

    # Ensure all accounts were found
    if any(a is None for a in [bank_main, accounts_receivable, accounts_payable, retained_earnings, rental_income, cost_of_sales]):
        print("Required accounts missing. Aborting.")
        return

    profile, created = PostingProfile.objects.update_or_create(
        name='Default Corporate Profile',
        defaults={
            'is_default': True,
            'bank_main': bank_main,
            'bank_trust': bank_trust,
            'accounts_receivable': accounts_receivable,
            'accounts_payable': accounts_payable,
            'vat_payable': vat_payable,
            'vat_receivable': vat_receivable,
            'tenant_deposits': tenant_deposits,
            'commission_receivable': commission_receivable,
            'commission_payable': commission_payable,
            'retained_earnings': retained_earnings,
            'rental_income': rental_income,
            'commission_income': commission_income,
            'sale_revenue': sale_revenue,
            'cost_of_sales': cost_of_sales,
            'commission_expense': commission_expense,
            'property_inventory': property_inventory
        }
    )
    
    if created:
        print(f"Created Default Posting Profile: {profile.name} mapped to your COA.")
    else:
        print(f"Updated Default Posting Profile '{profile.name}' to align with your new COA.")

if __name__ == '__main__':
    run()
