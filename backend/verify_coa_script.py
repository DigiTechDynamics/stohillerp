import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.finance.models.core import ChartOfAccount

def verify_coa():
    accounts = ChartOfAccount.objects.all().order_by('code')
    print(f"Total accounts in system: {accounts.count()}")
    print("-" * 60)
    print(f"{'Code':<10} {'Name':<40} {'Type':<12} {'Direct Post?'}")
    print("-" * 60)
    
    for acc in accounts:
        # Indent children for visual hierarchy
        prefix = "  - " if acc.parent else ""
        print(f"{acc.code:<10} {prefix + acc.name:<40} {acc.account_type:<12} {acc.allow_direct_posting}")

if __name__ == '__main__':
    verify_coa()
