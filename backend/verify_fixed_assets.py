import os
import django
import sys
from decimal import Decimal
from datetime import date, timedelta

# Setup Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.fixed_assets.models import AssetCategory, FixedAsset, AssetBook, AssetTransaction
from apps.fixed_assets.services.depreciation import DepreciationService
from apps.finance.models import ChartOfAccount, JournalEntry
from django.contrib.auth import get_user_model

User = get_user_model()

def verify_fixed_assets():
    print("--- Starting Fixed Asset Verification ---")
    user = User.objects.first()
    
    # 1. Ensure accounts exist
    asset_account, _ = ChartOfAccount.objects.get_or_create(
        code='1200', defaults={'name': 'Vehicles', 'account_type': 'asset'}
    )
    accum_depr, _ = ChartOfAccount.objects.get_or_create(
        code='1201', defaults={'name': 'Accumulated Depreciation - Vehicles', 'account_type': 'asset'}
    )
    depr_exp, _ = ChartOfAccount.objects.get_or_create(
        code='6500', defaults={'name': 'Depreciation Expense', 'account_type': 'expense'}
    )
    disposal, _ = ChartOfAccount.objects.get_or_create(
        code='7000', defaults={'name': 'Gain/Loss on Disposal', 'account_type': 'revenue'}
    )

    # 2. Create Category
    category, created = AssetCategory.objects.get_or_create(
        code='VEH',
        defaults={
            'name': 'Vehicles',
            'asset_cost_account': asset_account,
            'accum_depr_account': accum_depr,
            'depr_expense_account': depr_exp,
            'disposal_gain_loss_account': disposal,
            'created_by': user
        }
    )
    print(f"Category: {category.name} ({'Created' if created else 'Existing'})")

    # 3. Create Asset
    acquisition_date = date.today() - timedelta(days=32) # Acquire 1 month ago
    asset_code = f"TRUCK-{acquisition_date.strftime('%Y%m%d')}"
    asset, created = FixedAsset.objects.get_or_create(
        code=asset_code,
        defaults={
            'name': "Delivery Truck A1",
            'category': category,
            'acquisition_date': acquisition_date,
            'acquisition_cost': Decimal('50000.00'),
            'created_by': user
        }
    )
    print(f"Asset: {asset.name} ({'Created' if created else 'Existing'}), Cost: {asset.acquisition_cost}")

    # 4. Create Statutory Book
    book, created = AssetBook.objects.get_or_create(
        asset=asset,
        book_type='Statutory',
        defaults={
            'method': AssetBook.DeprMethod.STRAIGHT_LINE,
            'useful_life_months': 60, # 5 years
            'salvage_value': Decimal('5000.00'),
            'current_nbv': Decimal('50000.00'),
            'created_by': user
        }
    )
    print(f"Asset Book: {book.book_type} ({'Created' if created else 'Existing'}), Method: {book.method}")

    # 5. Run Depreciation
    service = DepreciationService(user=user)
    print("Running depreciation...")
    results = service.run_depreciation_for_period(asset_ids=[asset.id])
    
    if results:
        res = results[0]
        print(f"SUCCESS: Depreciation posted for {res['asset_code']}: {res['amount']}")
        
        # Verify DB updates
        book.refresh_from_db()
        print(f"New NBV: {book.current_nbv}")
        print(f"Acc. Depr: {book.accumulated_depreciation}")
        
        # Verify GL Entry
        last_trans = AssetTransaction.objects.filter(asset=asset).first()
        if last_trans and last_trans.journal_entry:
            print(f"Journal Entry Created: {last_trans.journal_entry.reference}")
            for line in last_trans.journal_entry.lines.all():
                print(f"  - GL: {line.account.code} | {line.side} | {line.amount}")
    else:
        print("FAILED: No depreciation was posted.")

    print("--- Verification Finished ---")

if __name__ == "__main__":
    verify_fixed_assets()
