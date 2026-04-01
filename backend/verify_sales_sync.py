import os
import django
from decimal import Decimal
from datetime import date
from django.utils import timezone

# Setup Django Environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.apps import apps
SaleTransaction = apps.get_model('sales', 'SaleTransaction')
Property = apps.get_model('properties', 'Property')
PropertyType = apps.get_model('properties', 'PropertyType')
Contact = apps.get_model('crm', 'Contact')
Employee = apps.get_model('hr', 'Employee')
Department = apps.get_model('hr', 'Department')
Currency = apps.get_model('core', 'Currency')
ChartOfAccount = apps.get_model('finance', 'ChartOfAccount')
CommissionRecord = apps.get_model('commissions', 'CommissionRecord')
User = apps.get_model('core', 'User')

from apps.finance.services.accounting import AccountingService

def verify():
    print("--- Starting Sales Finance Sync Verification ---")
    admin_user = User.objects.filter(is_superuser=True).first()
    today = date.today()
    
    # Ensure GL Accounts exist
    print("Ensuring required GL accounts exist...")
    ChartOfAccount.objects.get_or_create(code='4000', defaults={'name': 'Sale Revenue', 'account_type': 'revenue'})
    ChartOfAccount.objects.get_or_create(code='5100', defaults={'name': 'Commission Expense', 'account_type': 'expense'})
    ChartOfAccount.objects.get_or_create(code='2400', defaults={'name': 'Commission Payable', 'account_type': 'liability'})
    ChartOfAccount.objects.get_or_create(code='1510', defaults={'name': 'Property Inventory', 'account_type': 'asset'})
    ChartOfAccount.objects.get_or_create(code='5000', defaults={'name': 'Cost of Sales', 'account_type': 'expense'})

    # Ensure Journals exist
    print("Ensuring required journals exist...")
    from apps.finance.models import Journal
    Journal.objects.get_or_create(code='SJ', defaults={'name': 'Sales Journal', 'is_active': True})
    Journal.objects.get_or_create(code='CJ', defaults={'name': 'Commission Journal', 'is_active': True})
    Journal.objects.get_or_create(code='RJ', defaults={'name': 'Rental Journal', 'is_active': True})
    Journal.objects.get_or_create(code='GJ', defaults={'name': 'General Journal', 'is_active': True})

    # 1. Setup Test Data
    print("Setting up test data (Property, Buyer, Agent)...")
    ptype, _ = PropertyType.objects.get_or_create(code='SALE-TEST', defaults={'name': 'Sold Test Type'})
    
    # Generate unique ref
    timestamp = int(timezone.now().timestamp())
    prop_ref = f'PROP-SYNC-{timestamp}'
    
    prop = Property.objects.create(
        reference_number=prop_ref,
        name='Sale Sync Test Property', 
        property_type=ptype, 
        status='available',
        purchase_price=Decimal('1500000.00'),
        current_valuation=Decimal('2000000.00')
    )
    
    buyer_email = f'buyer.{timestamp}@example.com'
    buyer = Contact.objects.create(
        email=buyer_email,
        first_name='Test', 
        last_name='Buyer', 
        contact_type='buyer'
    )
    
    dept, _ = Department.objects.get_or_create(code='SALES', defaults={'name': 'Sales Dept'})
    
    agent_num = f'AGT-{timestamp}'
    agent = Employee.objects.create(
        employee_number=agent_num,
        first_name='Sales', 
        last_name='Agent', 
        department=dept,
        start_date=today
    )
    
    curr = Currency.objects.filter(code='USD').first() or Currency.objects.first()

    # 2. Create Sale Transaction
    print("Creating SaleTransaction (R2,000,000 with 5% commission)...")
    ref = f"SALE-{timestamp}"
    sale = SaleTransaction.objects.create(
        sale_reference=ref,
        property=prop,
        buyer=buyer,
        listing_agent=agent,
        selling_agent=agent,
        currency=curr,
        sale_price=Decimal('2000000.00'),
        commission_rate=Decimal('5.00'),
        commission_amount=Decimal('100000.00'),
        offer_date=today,
        status='offer_accepted'
    )

    # 3. Confirm Deal (Moves to Registered)
    print("Confirming deal...")
    sale.status = 'registered'
    sale.transfer_date = today
    sale.save()
    prop.status = 'sold'
    prop.save()

    # Capture initial balances for target accounts
    # 4000: Sale Revenue
    # 5100: Commission Expense
    # 2400: Commission Payable
    rev_acc = ChartOfAccount.objects.get(code='4000')
    exp_acc = ChartOfAccount.objects.get(code='5100')
    pay_acc = ChartOfAccount.objects.get(code='2400')
    
    init_rev = rev_acc.current_balance
    init_exp = exp_acc.current_balance
    init_pay = pay_acc.current_balance

    # 4. Post to Finance
    print("Posting to Finance via AccountingService...")
    service = AccountingService(user=admin_user)
    service.post_sale_transaction(sale)
    
    # 5. Verification
    print("\n--- Verifying Results ---")
    rev_acc.refresh_from_db()
    exp_acc.refresh_from_db()
    pay_acc.refresh_from_db()
    
    # Revenue Check (Credit increases Revenue account)
    rev_diff = rev_acc.current_balance - init_rev
    if rev_diff == Decimal('2000000.00'):
        print(f"[OK] Sale Revenue increased correctly by {rev_diff}")
    else:
        print(f"[FAIL] Sale Revenue mismatch. Expected +2,000,000, got {rev_diff}")

    # Expense Check (Debit increases Expense account)
    exp_diff = exp_acc.current_balance - init_exp
    if exp_diff == Decimal('100000.00'):
        print(f"[OK] Commission Expense increased correctly by {exp_diff}")
    else:
        print(f"[FAIL] Commission Expense mismatch. Expected +100,000, got {exp_diff}")

    # Payable Check (Credit increases Liability account)
    pay_diff = pay_acc.current_balance - init_pay
    if pay_diff == Decimal('100000.00'):
        print(f"[OK] Commission Payable increased correctly by {pay_diff}")
    else:
        print(f"[FAIL] Commission Payable mismatch. Expected +100,000, got {pay_diff}")

    # Commission Record Check
    comm = CommissionRecord.objects.filter(sale_transaction=sale).first()
    if comm and comm.journal_entry:
        print(f"[OK] CommissionRecord created and linked to Journal Entry: {comm.journal_entry.reference}")
    else:
        print("[FAIL] CommissionRecord missing or not linked to Journal Entry.")

if __name__ == "__main__":
    verify()
