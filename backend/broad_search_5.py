import os
import django # type: ignore
import sys

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.finance.models import JournalEntry # type: ignore
from django.db.models import Q # type: ignore

# Search for anything related to the number 5 or entries that might be what the user expects
entries = JournalEntry.objects.filter(
    Q(reference__icontains='5') | 
    Q(description__icontains='00005') |
    Q(source_reference__icontains='00005')
).order_by('-created_at')

print(f"{'Reference':<15} | {'Date':<12} | {'Description'}")
print("-" * 60)
for e in entries:
    print(f"{e.reference:<15} | {str(e.entry_date):<12} | {e.description}")
