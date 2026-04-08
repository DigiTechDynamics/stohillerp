import django
import os
import sys
from decimal import Decimal
from datetime import date

# Setup Django
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
django.setup()

from apps.core.models import Currency, Role
from apps.finance.models import (
    ChartOfAccount, Supplier, SupplierPayment, 
    JournalEntry, JournalLine, BankAccount, PostingProfile, FiscalYear, FiscalPeriod
)
from apps.finance.services.accounting import AccountingService

def setup_minimal_data():
    print("Setting up minimal data for verification...")
    # 1. Currency
    usd, _ = Currency.objects.get_or_create(
        code='USD',
        defaults={'name': 'US Dollar', 'symbol': '$', 'is_base': True}
    )

    # 2. COA
    bank_gl, _ = ChartOfAccount.objects.get_or_create(
        code='1010',
        defaults={'name': 'Main Bank', 'account_type': 'asset', 'account_sub_type': 'bank', 'allow_direct_posting': True}
    )
    ap_gl, _ = ChartOfAccount.objects.get_or_create(
        code='2000',
        defaults={'name': 'Accounts Payable', 'account_type': 'liability', 'account_sub_type': 'payable', 'allow_direct_posting': True}
    )
    charges_gl, _ = ChartOfAccount.objects.get_or_create(
        code='5810',
        defaults={'name': 'Bank Charges', 'account_type': 'expense', 'account_sub_type': 'operating_expense', 'allow_direct_posting': True}
    )

    # 3. Fiscal Period
    fy, _ = FiscalYear.objects.get_or_create(
        name='FY 2026',
        defaults={'start_date': date(2026, 1, 1), 'end_date': date(2026, 12, 31)}
    )
    fp, _ = FiscalPeriod.objects.get_or_create(
        fiscal_year=fy,
        period_number=4,
        defaults={'name': 'April 2026', 'start_date': date(2026, 4, 1), 'end_date': date(2026, 4, 30), 'status': 'open'}
    )

    # 4. Bank Account
    bank_acc, _ = BankAccount.objects.get_or_create(
        gl_account=bank_gl,
        defaults={
            'name': 'Main USD Account',
            'bank_name': 'ZimBank',
            'account_number': '987654321',
            'currency': usd
        }
    )

    # 5. Supplier
    supplier, _ = Supplier.objects.get_or_create(
        name="Zim Power Utility",
        defaults={'currency': usd, 'ap_account': ap_gl}
    )

    return supplier, bank_acc

def verify_zim_compliance():
    print("--- Verifying Zimbabwe Compliance (USD Only) ---")
    
    supplier, bank_acc = setup_minimal_data()
    service = AccountingService()

    # Test IMTT (1%) on Supplier Payment
    print("\nTesting IMTT (1%) on Supplier Payment of $2500...")
    
    payment = SupplierPayment.objects.create(
        supplier=supplier,
        bank_account=bank_acc,
        amount=Decimal('2500.00'),
        payment_date=date(2026, 4, 7),
        payment_reference="PAY-ZIM-FINAL-TEST"
    )
    
    try:
        entry = service.post_supplier_payment(payment)
        print(f"Journal Entry Created: {entry.reference}")
        
        lines = list(entry.lines.all().values('account__code', 'account__name', 'side', 'amount'))
        print("GL Lines:")
        for l in lines:
            print(f"  {l['account__code']} ({l['account__name']}): {l['side']} {l['amount']}")
        
        # Verify IMTT (1% of 2500 = 25)
        # Expected lines: 
        # DR 2000 (AP) 2500
        # DR 5810 (Charges) 25
        # CR 1010 (Bank) 2500
        # CR 1010 (Bank) 25
        
        imtt_expense = entry.lines.filter(account__code='5810', side='debit', amount=Decimal('25.00')).first()
        total_bank_credit = sum(line.amount for line in entry.lines.filter(account__code='1010', side='credit'))
        
        if imtt_expense and total_bank_credit == Decimal('2525.00'):
            print(f"\nSUCCESS: IMTT calculation and posting verified!")
            print(f"  IMTT Debit: {imtt_expense.amount} to {imtt_expense.account.name}")
            print(f"  Total Bank Credit: {total_bank_credit} (Payment + IMTT)")
        else:
            print("\nFAILURE: IMTT logic did not produce expected GL entries.")
            if not imtt_expense: print("  Missing IMTT debit to account 5810")
            if total_bank_credit != Decimal('2525.00'): print(f"  Bank credit total mismatch: got {total_bank_credit}, expected 2525.00")
            
    except Exception as e:
        print(f"Error during posting: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    verify_zim_compliance()
