import os
import django
from datetime import date
import sys

# Setup
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.finance.services.tax_service import TaxService

def verify():
    print("--- Verifying Phase 1 Backend Services ---")
    start = date(2026, 1, 1)
    end = date(2026, 12, 31)
    
    # 1. VAT-7
    try:
        vat7 = TaxService.generate_vat7_report(start, end)
        print(f"SUCCESS: VAT-7 Report generated. Keys: {list(vat7.keys())}")
        print(f"   Net Payable: {vat7['summary']['net_vat_payable']}")
    except Exception as e:
        print(f"ERROR: VAT-7 Report failed: {e}")
        

if __name__ == "__main__":
    verify()
