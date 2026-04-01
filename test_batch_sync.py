import os
import sys
import django
from decimal import Decimal

# Setup Django environment
# The script is in the root, /backend is a subdirectory
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.finance.models import Journal, JournalBatch, JournalEntry, JournalLine, ChartOfAccount, FiscalPeriod, FiscalYear
from apps.core.models import User, Currency

def test():
    print("--- Running Batch Total Recalculation Test ---")
    
    # Get dependencies
    user = User.objects.filter(is_superuser=True).first()
    if not user:
        user = User.objects.first()
        
    print(f"DEBUG: All Journals count: {Journal.objects.count()}")
    journal = Journal.objects.filter(code__iexact='GJ').first()
    if not journal:
        journal = Journal.objects.first()
    print(f"DEBUG: Selected Journal: {journal}")
        
    period = FiscalPeriod.objects.filter(status='open').first()
    if not period:
        period = FiscalPeriod.objects.first()
        
    currency = Currency.objects.get(code='USD')
    # Try finding an expense account
    acc_dr = ChartOfAccount.objects.filter(account_type='expense').first()
    if not acc_dr:
        acc_dr = ChartOfAccount.objects.exclude(account_type='asset').first()
        
    # Try finding an asset account (for credit)
    acc_cr = ChartOfAccount.objects.filter(account_type='asset').first()
    if not acc_cr:
        acc_cr = ChartOfAccount.objects.exclude(pk=acc_dr.pk).first()

    if not user:
        print("FAIL: No User found")
        return
    if not journal:
        print("FAIL: No Journal found")
        return
    if not period:
        print("FAIL: No FiscalPeriod found")
        return
    if not acc_dr:
        print("FAIL: No DR Account found")
        return
    if not acc_cr:
        print("FAIL: No CR Account found")
        return

    print("Status: All test data resolved. Proceeding with sync tests.")

    # cleanup any previous test batch
    JournalBatch.objects.filter(description="Test Sync Batch").delete()

    # 1. Create a Batch
    batch = JournalBatch.objects.create(
        description="Test Sync Batch",
        fiscal_period=period,
        journal=journal,
        maker=user
    )
    print(f"Created Batch: {batch.batch_number}. Initial Totals: DR {batch.total_debits}, CR {batch.total_credits}")

    # 2. Create an Entry
    entry = JournalEntry.objects.create(
        batch=batch,
        journal=journal,
        fiscal_period=period,
        currency=currency,
        entry_date=period.start_date,
        description="Entry 1",
    )
    
    # Add Lines
    print("Adding lines to entry 1...")
    JournalLine.objects.create(entry=entry, account=acc_dr, side='debit', amount_currency=Decimal('100.00'), amount=Decimal('100.00'))
    JournalLine.objects.create(entry=entry, account=acc_cr, side='credit', amount_currency=Decimal('100.00'), amount=Decimal('100.00'))
    
    batch.refresh_from_db()
    print(f"After adding 100.00 entry lines: DR {batch.total_debits}, CR {batch.total_credits}")
    if batch.total_debits != Decimal('100.00') or batch.total_credits != Decimal('100.00'):
        print("FAILED: Totals mismatch after line creation.")
        return

    # 3. Add another entry
    print("Adding entry 2...")
    entry2 = JournalEntry.objects.create(
        batch=batch,
        journal=journal,
        fiscal_period=period,
        currency=currency,
        entry_date=period.start_date,
        description="Entry 2",
    )
    JournalLine.objects.create(entry=entry2, account=acc_dr, side='debit', amount_currency=Decimal('50.00'), amount=Decimal('50.00'))
    JournalLine.objects.create(entry=entry2, account=acc_cr, side='credit', amount_currency=Decimal('50.00'), amount=Decimal('50.00'))
    
    batch.refresh_from_db()
    print(f"After adding 50.00 entry lines: DR {batch.total_debits}, CR {batch.total_credits}")
    if batch.total_debits != Decimal('150.00'):
        print("FAILED: Totals mismatch after entry 2 creation.")
        return

    # 4. Remove one entry from batch
    print("Removing entry 2 from batch...")
    entry2.batch = None
    entry2.save()
    batch.refresh_from_db()
    print(f"After removing entry 2: DR {batch.total_debits}, CR {batch.total_credits}")
    if batch.total_debits != Decimal('100.00'):
        print("FAILED: Totals mismatch after entry 2 removal.")
        return

    # 5. Modify a line in entry 1
    print("Modifying line amount in entry 1...")
    line = entry.lines.filter(side='debit').first()
    line.amount = Decimal('120.00')
    line.amount_currency = Decimal('120.00')
    line.save()
    
    batch.refresh_from_db()
    print(f"After modifying line (100 -> 120): DR {batch.total_debits}, CR {batch.total_credits}")
    if batch.total_debits != Decimal('120.00'):
        print("FAILED: Totals mismatch after line modification.")
        return

    print("--- Test PASSED ---")
    
    # Cleanup
    JournalEntry.objects.filter(batch=batch).delete()
    batch.delete()

if __name__ == "__main__":
    test()
