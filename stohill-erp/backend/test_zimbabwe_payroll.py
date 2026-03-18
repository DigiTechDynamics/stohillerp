import os
import django  # type: ignore
import sys
from decimal import Decimal
from django.utils import timezone  # type: ignore
from datetime import timedelta

# Setup Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.payroll.models import PayrollRun, PayrollItem  # type: ignore
from apps.hr.models import Employee  # type: ignore
from apps.core.models import Currency  # type: ignore
from apps.payroll.services.zimbabwe import ZimbabweTaxService  # type: ignore

def verify_calculations():
    print("Starting Zimbabwe Payroll Logic Verification...")
    
    # 1. USD Test Case ($1500 Gross)
    print("\n[Test Case 1: USD $1500]")
    usd_income = Decimal('1500.00')
    paye_usd = ZimbabweTaxService.calculate_paye(usd_income, "USD")
    aids_usd = ZimbabweTaxService.calculate_aids_levy(paye_usd)
    nssa_usd = ZimbabweTaxService.calculate_nssa(usd_income, "USD")
    
    print(f"PAYE (Expected 365.00): {paye_usd}")
    print(f"AIDS Levy (Expected 10.95): {aids_usd}")
    print(f"NSSA (Expected 31.50): {nssa_usd}")
    
    assert paye_usd == Decimal('365.00'), f"USD PAYE failed, got {paye_usd}"
    assert aids_usd == Decimal('10.95'), f"USD AIDS failed, got {aids_usd}"
    assert nssa_usd == Decimal('31.50'), f"USD NSSA failed, got {nssa_usd}"
    
    # 2. ZWG Test Case (ZWG 5000 Gross)
    print("\n[Test Case 2: ZWG 5000]")
    zWG_income = Decimal('5000.00')
    paye_zWG = ZimbabweTaxService.calculate_paye(zWG_income, "ZWG")
    aids_zWG = ZimbabweTaxService.calculate_aids_levy(paye_zWG)
    nssa_zWG = ZimbabweTaxService.calculate_nssa(zWG_income, "ZWG")
    
    # 5000 * 0.25 - 474.60 = 775.40
    # Aids: 775.40 * 0.03 = 23.262 -> 23.26
    # NSSA: 4.5% of 5000 = 225
    print(f"PAYE (Expected 775.40): {paye_zWG}")
    print(f"AIDS Levy (Expected 23.26): {aids_zWG}")
    print(f"NSSA (Expected 225.00): {nssa_zWG}")
    
    assert paye_zWG == Decimal('775.40'), f"ZWG PAYE failed, got {paye_zWG}"
    assert aids_zWG == Decimal('23.26'), f"ZWG AIDS failed, got {aids_zWG}"
    assert nssa_zWG == Decimal('225.00'), f"ZWG NSSA failed, got {nssa_zWG}"

    # 3. NSSA Capping Verification
    print("\n[Test Case 3: NSSA Capping]")
    high_usd = Decimal('5000.00')
    nssa_capped = ZimbabweTaxService.calculate_nssa(high_usd, "USD")
    print(f"USD NSSA Capped (Expected 31.50): {nssa_capped}")
    assert nssa_capped == Decimal('31.50')
    
    print("\n[ALL LOGIC CHECKS PASSED]")

if __name__ == "__main__":
    try:
        verify_calculations()
    except Exception as e:
        print(f"FAILED: {e}")
        sys.exit(1)
