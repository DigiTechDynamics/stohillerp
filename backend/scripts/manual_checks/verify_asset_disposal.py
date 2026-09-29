import os
import django
import sys
from decimal import Decimal
from datetime import date, timedelta

# Setup Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from apps.fixed_assets.models import AssetCategory, FixedAsset, AssetBook, AssetTransaction
from apps.fixed_assets.services.depreciation import DepreciationService
from apps.finance.models import ChartOfAccount, JournalEntry
from django.contrib.auth import get_user_model

User = get_user_model()

def verify_disposal():
    print("--- Starting Asset Disposal Verification ---")
    user = User.objects.first()
    
    # 1. Get existing setup
    category = AssetCategory.objects.get(code='VEH')
    
    # 2. Create another Asset for disposal test
    asset = FixedAsset.objects.create(
        code=f"DISP-TEST-{date.today().strftime('%Y%m%d%H%M')}",
        name="Old Computer",
        category=category,
        acquisition_date=date.today() - timedelta(days=365), # 1 year ago
        acquisition_cost=Decimal('2000.00'),
        created_by=user
    )
    
    # NBV after 1 year (Straight line, 5 years)
    # monthly = 2000 / 60 = 33.33
    # 12 months = 400.00
    book = AssetBook.objects.create(
        asset=asset,
        book_type='Statutory',
        method=AssetBook.DeprMethod.STRAIGHT_LINE,
        useful_life_months=60,
        current_nbv=Decimal('1600.00'),
        accumulated_depreciation=Decimal('400.00'),
        created_by=user
    )
    
    print(f"Asset for Disposal: {asset.name}, Cost: {asset.acquisition_cost}, NBV: {book.current_nbv}")

    # 3. Process Disposal
    service = DepreciationService(user=user)
    disposal_date = date.today()
    net_proceeds = Decimal('1800.00') # Selling for more than NBV -> 200 Gain
    
    print(f"Disposing for {net_proceeds}...")
    result = service.post_asset_disposal(
        asset_id=asset.id,
        disposal_date=disposal_date,
        net_proceeds=net_proceeds,
        notes="Sold to employee"
    )
    
    print(f"Result: {result}")
    
    # 4. Verify GL impact
    # Expected:
    # DR Bank 1800
    # DR Accum Depr 400
    # CR Asset Cost 2000
    # CR Gain on Disposal 200
    
    last_trans = AssetTransaction.objects.filter(asset=asset, transaction_type='disposal').first()
    if last_trans and last_trans.journal_entry:
        print(f"Journal Entry: {last_trans.journal_entry.reference}")
        for line in last_trans.journal_entry.lines.all():
            print(f"  - GL: {line.account.code} ({line.account.name}) | {line.side} | {line.amount}")
            
    # Check status
    asset.refresh_from_db()
    print(f"New Asset Status: {asset.status}")
    
    print("--- Disposal Verification Finished ---")

if __name__ == "__main__":
    verify_disposal()
