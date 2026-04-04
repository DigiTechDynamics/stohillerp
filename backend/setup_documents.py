
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.core.models import Role, Module
from apps.documents.models import DocumentWorkspace

def setup_documents():
    print("--- Configuring Document Module & Workspaces ---")
    
    # 1. Update Module Access for Roles
    module_doc = Module.objects.filter(code='documents').first()
    if module_doc:
        # Sales Manager
        role_sales = Role.objects.filter(role_type='sales_manager').first()
        if role_sales:
            role_sales.modules.add(module_doc)
            print(f"Added 'documents' module to {role_sales.name}")
        
        # Finance Manager
        role_finance = Role.objects.filter(role_type='finance_manager').first()
        if role_finance:
            role_finance.modules.add(module_doc)
            print(f"Added 'documents' module to {role_finance.name}")
    else:
        print("Module 'documents' not found!")

    # 2. Create System Workspaces
    workspaces = [
        {'name': 'Legal & Compliance', 'code': 'legal', 'description': 'FICA/KYC, Title Deeds, POA, and Legal Contracts', 'icon': 'ShieldCheck'},
        {'name': 'Property Records', 'code': 'properties', 'description': 'Floor Plans, Valuations, and Physical Assets', 'icon': 'Building2'},
        {'name': 'Tenancy', 'code': 'tenancy', 'description': 'Lease Agreements and Rental Applications', 'icon': 'Home'},
        {'name': 'Finance & Tax', 'code': 'finance', 'description': 'Audited Statements, VAT Filings, and Banking Docs', 'icon': 'Landmark'},
        {'name': 'Sales & Marketing', 'code': 'sales', 'description': 'Offers to Purchase, Brochures, and Mandates', 'icon': 'TrendingUp'},
        {'name': 'HR & Payroll', 'code': 'hr', 'description': 'Employee Contracts and Payroll Records (Confidential)', 'icon': 'UserCog'},
    ]

    for ws in workspaces:
        obj, created = DocumentWorkspace.objects.get_or_create(
            code=ws['code'],
            defaults={'name': ws['name'], 'description': ws['description'], 'icon': ws['icon']}
        )
        if created:
            print(f"Created workspace: {ws['name']}")
        else:
            # Update existing if needed
            obj.name = ws['name']
            obj.description = ws['description']
            obj.icon = ws['icon']
            obj.save()
            print(f"Updated workspace: {ws['name']}")
            
    print("--- Configuration Complete ---")

if __name__ == '__main__':
    setup_documents()
