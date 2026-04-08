
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.core.models import Module, SODRule

def seed_sod():
    print("--- Seeding Segregation of Duties (SOD) Rules ---")
    
    # 1. Get modules
    def get_mod(code):
        return Module.objects.filter(code=code).first()

    m_gl = get_mod('finance_gl')
    m_banking = get_mod('banking')
    m_commissions = get_mod('commissions')
    m_sales = get_mod('sales')
    m_payroll = get_mod('payroll')
    m_hr = get_mod('hr')
    m_admin = get_mod('admin')

    rules = [
        {
            'name': 'Finance GL vs Banking',
            'module_a': m_gl,
            'module_b': m_banking,
            'severity': SODRule.Severity.CRITICAL,
            'description': 'Critical conflict: Reconciling bank accounts while having GL access can hide unauthorized transactions.'
        },
        {
            'name': 'Sales vs Commissions Approval',
            'module_a': m_sales,
            'module_b': m_commissions,
            'severity': SODRule.Severity.WARNING,
            'description': 'Warning: Sales staff should not approve their own commission structures.'
        },
        {
            'name': 'HR vs Payroll Processing',
            'module_a': m_hr,
            'module_b': m_payroll,
            'severity': SODRule.Severity.CRITICAL,
            'description': 'Critical conflict: Managing employee records and processing payments allows creation of ghost employees.'
        },
        {
            'name': 'User Access vs System Audit',
            'module_a': m_admin,
            'module_b': m_gl, # Using GL as a proxy for financial audit module
            'severity': SODRule.Severity.CRITICAL,
            'description': 'Critical conflict: Administrators should not have operational financial access to avoid clearing trails.'
        }
    ]

    for r_data in rules:
        if r_data['module_a'] and r_data['module_b']:
            rule, created = SODRule.objects.update_or_create(
                module_a=r_data['module_a'],
                module_b=r_data['module_b'],
                defaults={
                    'name': r_data['name'],
                    'severity': r_data['severity'],
                    'description': r_data['description'],
                    'is_active': True
                }
            )
            if created:
                print(f"Created SOD Rule: {r_data['name']}")
            else:
                print(f"Updated SOD Rule: {r_data['name']}")
        else:
            print(f"Skipping rule '{r_data['name']}' - missing one or both modules.")

    print("--- SOD Seeding Complete ---")

if __name__ == '__main__':
    seed_sod()
