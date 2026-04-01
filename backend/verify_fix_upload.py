import os
import django
import sys
from unittest.mock import MagicMock

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.documents.models import Document, DocumentCategory, DocumentWorkspace, ComplianceRequirement, ComplianceRecord
from apps.documents.views import DocumentViewSet
from django.core.files.uploadedfile import SimpleUploadedFile
from apps.crm.models import Contact

def run_test():
    print("--- Starting Document Upload Final Verification ---")
    
    # 1. Ensure a Workspace exists
    workspace, _ = DocumentWorkspace.objects.get_or_create(
        code='vault-test', 
        defaults={'name': 'Test Vault'}
    )
    print(f"Using Workspace: {workspace.name}")

    # 2. Ensure DocumentCategory exists for 'kyc'
    category_kyc, _ = DocumentCategory.objects.get_or_create(
        code='kyc', 
        defaults={'name': 'KYC / ID'}
    )
    print(f"Using Category: {category_kyc.name} (code: {category_kyc.code})")

    # 3. Ensure ComplianceRequirement exists for 'kyc'
    requirement, _ = ComplianceRequirement.objects.get_or_create(
        name='Proof of Identity',
        applies_to='contact',
        defaults={'regulation': 'kyc'}
    )
    print(f"Using Requirement: {requirement.name}")

    # 4. Ensure a Contact exists for linking
    contact, _ = Contact.objects.get_or_create(
        email='test-doc-upload@stohill.com',
        defaults={'first_name': 'Test', 'last_name': 'Uploader'}
    )
    print(f"Using Contact: {contact.first_name} {contact.last_name}")

    # 5. Create a mock file
    mock_file = SimpleUploadedFile("test_id_v2.pdf", b"pdf content", content_type="application/pdf")

    # 6. Mock the Request
    from apps.core.models import User
    admin_user = User.objects.filter(is_superuser=True).first()
    if not admin_user:
        # Create a temporary test admin for the verification
        admin_user, _ = User.objects.get_or_create(
            email='verify-admin@stohill.com',
            defaults={'first_name': 'Verify', 'last_name': 'Admin', 'is_superuser': True, 'is_staff': True}
        )

    mock_request = MagicMock()
    mock_request.user = admin_user
    mock_request.data = {
        'file': mock_file,
        'title': 'Test Final ID',
        'category': 'kyc', # String code from frontend
        'workspace': workspace.id,
        'related_object_type': 'contact',
        'related_object_id': contact.id,
        'is_confidential': True
    }

    # 7. Use the real serializer to verify validation
    from apps.documents.serializers import DocumentSerializer
    
    viewset = DocumentViewSet()
    viewset.request = mock_request
    
    # We want to test perform_create which calls serializer.save()
    # We'll use the real serializer but we need to make sure the data is valid
    serializer = DocumentSerializer(data=mock_request.data)
    if not serializer.is_valid():
        print(f"[ERROR] Serializer invalid: {serializer.errors}")
        sys.exit(1)

    print("[INFO] Serializer validation passed.")

    try:
        # We manually call perform_create
        viewset.perform_create(serializer)
        
        # 8. Assertions
        created_doc = Document.objects.filter(title='Test Final ID').first()
        assert created_doc is not None, "Document was not created"
        assert created_doc.category == category_kyc, "Category was not correctly resolved"
        assert created_doc.contact == contact, "Contact link was not correctly set"
        assert created_doc.is_confidential is True, "Confidentiality flag was not set"
        assert created_doc.reference.startswith('DOC-'), f"Reference '{created_doc.reference}' is invalid"
        
        print(f"[SUCCESS] Document created: {created_doc.reference}")

        # 9. Verify Compliance Hook
        record = ComplianceRecord.objects.filter(contact=contact, requirement=requirement).first()
        assert record is not None, "Compliance record was not created/linked"
        assert record.status == ComplianceRecord.ComplianceStatus.COMPLIANT, f"Compliance status is {record.status}, expected COMPLIANT"
        assert record.document == created_doc, "Compliance record not linked to the uploaded document"
        
        print(f"[SUCCESS] Compliance record updated: {record.status}")
        
    except Exception as e:
        print(f"\n[FAILED] Verification crashed with: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    run_test()
