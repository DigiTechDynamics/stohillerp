import os
import django # type: ignore
import uuid
from decimal import Decimal
from datetime import date

# Set up Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.finance.models import ( # type: ignore
    CustomerProfile, CustomerInvoice, CustomerInvoiceLine, 
    CustomerReceipt, ChartOfAccount, BankAccount, FiscalPeriod, JournalEntry
)
from apps.finance.services.accounting import AccountingService # type: ignore
from apps.crm.models import Contact # type: ignore

def verify_allocation():
    service = AccountingService()
    
    # 1. Setup Data
    # Get or create an AR account
    ar_account = ChartOfAccount.objects.filter(account_sub_type='receivable').first()
    # Find a revenue account that allows direct posting (leaf account)
    revenue_account = ChartOfAccount.objects.filter(account_type='revenue', allow_direct_posting=True).first()
    bank_account = BankAccount.objects.first()
    
    if not ar_account or not revenue_account or not bank_account:
        print("Missing accounts or bank account to run test.")
        return

    # Create a test customer
    contact = Contact.objects.create(first_name="Test", last_name="Customer")
    customer = CustomerProfile.objects.create(
        contact_link=contact,
        name="Test Customer",
        ar_account=ar_account
    )

    print(f"Initial Customer Balance: {customer.balance}")

    # 2. Create 2 Invoices
    inv1 = CustomerInvoice.objects.create(
        customer=customer,
        invoice_date=date.today(),
        due_date=date.today(),
        total_amount=Decimal('1000.00'),
        status=CustomerInvoice.InvoiceStatus.DRAFT
    )
    # Add line to balance it
    CustomerInvoiceLine.objects.create(
        invoice=inv1,
        description="Consulting Fee",
        revenue_account=revenue_account,
        quantity=1,
        unit_price=Decimal('1000.00'),
        line_total=Decimal('1000.00')
    )
    # Post it to GL 
    inv1.status = CustomerInvoice.InvoiceStatus.POSTED
    inv1.save()
    service.post_customer_invoice(inv1)
    
    inv2 = CustomerInvoice.objects.create(
        customer=customer,
        invoice_date=date.today(),
        due_date=date.today(),
        total_amount=Decimal('500.00'),
        status=CustomerInvoice.InvoiceStatus.DRAFT
    )
    CustomerInvoiceLine.objects.create(
        invoice=inv2,
        description="Software License",
        revenue_account=revenue_account,
        quantity=1,
        unit_price=Decimal('500.00'),
        line_total=Decimal('500.00')
    )
    inv2.status = CustomerInvoice.InvoiceStatus.POSTED
    inv2.save()
    service.post_customer_invoice(inv2)

    # Refresh customer
    customer.refresh_from_db()
    print(f"Balance after 2 invoices (1000 + 500): {customer.balance}")

    # 3. Post a receipt (1250)
    # This should pay off Inv1 (1000) and half of Inv2 (250)
    receipt = CustomerReceipt.objects.create(
        customer=customer,
        receipt_date=date.today(),
        amount=Decimal('1250.00'),
        bank_account=bank_account,
        status=CustomerReceipt.ReceiptStatus.DRAFT
    )
    
    service.post_customer_receipt(receipt)
    
    # 4. Verify
    inv1.refresh_from_db()
    inv2.refresh_from_db()
    customer.refresh_from_db()

    print(f"Invoice 1 Status: {inv1.status}, Paid: {inv1.amount_paid}")
    print(f"Invoice 2 Status: {inv2.status}, Paid: {inv2.amount_paid}")
    print(f"Final Customer Balance: {customer.balance}")

    expected_balance = Decimal('250.00')
    if customer.balance == expected_balance:
        print("SUCCESS: Balance is correct!")
    else:
        print(f"FAILURE: Expected {expected_balance}, got {customer.balance}")

    if inv1.status == 'paid' and inv2.status == 'partial':
        print("SUCCESS: Allocation logic is correct!")
    else:
        print("FAILURE: Allocation logic failed.")

if __name__ == "__main__":
    verify_allocation()
