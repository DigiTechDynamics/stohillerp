import os
import django # type: ignore
import sys
from decimal import Decimal
from datetime import date

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.finance.models import CustomerProfile, BankAccount, ChartOfAccount, CustomerReceipt # type: ignore
from apps.finance.services.accounting import AccountingService # type: ignore
from apps.crm.models import Contact # type: ignore

try:
    # 1. Ensure GL account 1010 exists
    bank_gl, _ = ChartOfAccount.objects.get_or_create(
        code='1010',
        defaults={
            'name': 'Main Operating Account',
            'account_type': 'asset',
            'is_active': True,
            'allow_direct_posting': True
        }
    )
    
    # 2. Ensure BankAccount object exists
    bank, created = BankAccount.objects.get_or_create(
        gl_account=bank_gl,
        defaults={
            'name': 'Standard Bank - Main',
            'bank_name': 'Standard Bank',
            'account_number': '123456789',
            'account_type': 'cheque',
            'is_active': True
        }
    )
    if created:
        print("Created default BankAccount.")
    
    # 3. Find Customer Profile for Kevin
    contact = Contact.objects.get(first_name="Kevin", last_name="Laubscher")
    profile = CustomerProfile.objects.get(contact_link=contact)
    
    # 4. Use AccountingService to post receipt
    service = AccountingService()
    
    receipt = CustomerReceipt.objects.create(
        customer=profile,
        receipt_date=date.today(),
        receipt_reference="PMT-KEVIN-001",
        amount=Decimal('200.00'),
        bank_account=bank,
        status=CustomerReceipt.ReceiptStatus.DRAFT
    )
    
    je = service.post_customer_receipt(receipt)
    
    receipt.status = CustomerReceipt.ReceiptStatus.POSTED
    receipt.journal_entry = je
    receipt.save(update_fields=['status', 'journal_entry'])
    
    print(f"Successfully posted receipt {receipt.receipt_reference} | Journal: {je.reference}")
    print(f"DR: Banking ({bank_gl.code}) | $200.00")
    print(f"CR: Accounts Receivable ({profile.ar_account.code}) | $200.00 | Contact: {contact.full_name}")

except Exception as e:
    import traceback
    print(f"Error: {str(e)}")
    traceback.print_exc()
