import os
import django # type: ignore
import sys
from decimal import Decimal

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.finance.models import JournalEntry, JournalLine # type: ignore
from apps.crm.models import Contact # type: ignore

try:
    contact = Contact.objects.get(first_name="Kevin", last_name="Laubscher")
    print(f"Contact Found: {contact.full_name} ({contact.id})")
    
    lines = JournalLine.objects.filter(contact_ref=contact).select_related('entry', 'account').order_by('entry__entry_date')
    
    print("\nTransaction History for Kevin Laubscher:")
    print(f"{'Date':<12} | {'Ref':<12} | {'Account':<6} | {'Side':<7} | {'Amount':>10} | {'Description'}")
    print("-" * 100)
    
    total_debit = Decimal('0.00')
    total_credit = Decimal('0.00')
    
    for line in lines:
        amount = Decimal(str(line.amount))
        if line.side == 'debit':
            total_debit += amount # type: ignore
        else:
            total_credit += amount # type: ignore
            
        print(f"{str(line.entry.entry_date):<12} | {line.entry.reference:<12} | {line.account.code:<6} | {line.side.upper():<7} | {amount:>10} | {line.description}")
        
    print("-" * 100)
    print(f"{'TOTALS':<12} | {'':<12} | {'':<6} | {'':<7} | {'Debit: ' + str(total_debit.quantize(Decimal('0.01'))):>20} | {'Credit: ' + str(total_credit.quantize(Decimal('0.01')))}") # type: ignore
    print(f"NET BALANCE: {(total_debit - total_credit).quantize(Decimal('0.01'))}") # type: ignore

except Contact.DoesNotExist:
    print("Contact Kevin Laubscher not found.")
except Exception as e:
    print(f"Error: {str(e)}")
