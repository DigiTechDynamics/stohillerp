import os
import django
import sys

# Set up Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.documents.models import DocumentWorkspace, DocumentCategory, ComplianceRequirement

def seed_documents():
    print("--- Seeding Document Workspaces ---")
    workspaces = [
        {'name': 'Company Legal Vault', 'code': 'legal', 'description': 'Corporate legal documents, contracts, and deeds.'},
        {'name': 'HR & Employee Records', 'code': 'hr', 'description': 'Employee files, IDs, and internal HR docs.'},
        {'name': 'Customer KYC & FICA', 'code': 'kyc', 'description': 'Customer identification and compliance documents.'},
        {'name': 'Finance & Invoices', 'code': 'finance', 'description': 'Supplier invoices, receipts, and tax records.'},
        {'name': 'General Archive', 'code': 'archive', 'description': 'Older documents and miscellaneous files.'},
    ]

    for ws_data in workspaces:
        ws, created = DocumentWorkspace.objects.get_or_create(
            code=ws_data['code'],
            defaults={'name': ws_data['name'], 'description': ws_data['description']}
        )
        if created:
            print(f"Created workspace: {ws.name}")
        else:
            print(f"Workspace already exists: {ws.name}")

    print("\n--- Seeding Document Categories ---")
    categories = [
        {'name': 'Identification (ID/Passport)', 'code': 'kyc', 'retention_years': 10},
        {'name': 'Lease Agreement', 'code': 'lease', 'retention_years': 7},
        {'name': 'Sales Agreement', 'code': 'sale', 'retention_years': 10},
        {'name': 'Utility Bill / Proof of Residence', 'code': 'utility', 'retention_years': 3},
        {'name': 'Tax Invoice', 'code': 'invoice', 'retention_years': 7},
        {'name': 'Employment Contract', 'code': 'employment', 'retention_years': 15},
    ]

    for cat_data in categories:
        cat, created = DocumentCategory.objects.get_or_create(
            code=cat_data['code'],
            defaults={'name': cat_data['name'], 'retention_years': cat_data['retention_years']}
        )
        if created:
            print(f"Created category: {cat.name}")
        else:
            print(f"Category already exists: {cat.name}")

    print("\n--- Seeding Compliance Requirements ---")
    requirements = [
        # Contact-based (FICA)
        {'name': 'Proof of Identity (FICA)', 'regulation': 'kyc', 'applies_to': 'contact', 'description': 'Valid Passport or ID card.'},
        {'name': 'Proof of Residence', 'regulation': 'utility', 'applies_to': 'contact', 'description': 'Not older than 3 months.'},
        # Employee-based
        {'name': 'Signed Employment Contract', 'regulation': 'employment', 'applies_to': 'employee', 'description': 'Original signed copy.'},
    ]

    for req_data in requirements:
        req, created = ComplianceRequirement.objects.get_or_create(
            name=req_data['name'],
            applies_to=req_data['applies_to'],
            defaults={'regulation': req_data['regulation'], 'description': req_data['description']}
        )
        if created:
            print(f"Created requirement: {req.name}")
        else:
            print(f"Requirement already exists: {req.name}")

    print("\n--- Seeding Complete ---")

if __name__ == "__main__":
    seed_documents()
