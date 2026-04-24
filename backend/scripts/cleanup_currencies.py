
import os
import django
import sys
from decimal import Decimal

# Set up Django environment
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.db import transaction
from django.utils import timezone
from apps.core.models import Currency
from apps.finance.models import (
    BankAccount, ChartOfAccount, JournalEntry, JournalLine,
    CustomerInvoice, CustomerReceipt, Supplier, SupplierInvoice, SupplierPayment,
    ExchangeRate
)

def cleanup_currencies():
    print("Starting Currency Cleanup and Migration...")
    
    with transaction.atomic():
        # 1. Ensure ZiG exists
        zig, created = Currency.objects.get_or_create(
            code='ZiG',
            defaults={
                'name': 'Zimbabwe Gold',
                'symbol': 'ZiG',
                'is_base': False
            }
        )
        if created:
            print("Created ZiG currency.")
        else:
            print("ZiG currency already exists.")

        # 2. Ensure USD exists and is base
        usd, created = Currency.objects.get_or_create(
            code='USD',
            defaults={
                'name': 'United States Dollar',
                'symbol': '$',
                'is_base': True
            }
        )
        if not usd.is_base:
            Currency.objects.filter(is_base=True).update(is_base=False)
            usd.is_base = True
            usd.save()
            print("Set USD as base currency.")

        # 3. Identify ZWL and ZAR
        zwl = Currency.objects.filter(code='ZWL').first()
        zar = Currency.objects.filter(code='ZAR').first()

        # 4. Migrate ZWL to ZiG
        if zwl:
            print(f"Migrating records from ZWL to ZiG...")
            
            # Bank Accounts (Uses to_field='code')
            updated = BankAccount.objects.filter(currency='ZWL').update(currency='ZiG')
            print(f"  - Updated {updated} Bank Accounts (Code based)")
            
            # Chart of Accounts
            updated = ChartOfAccount.objects.filter(currency_id=zwl.id).update(currency_id=zig.id)
            print(f"  - Updated {updated} GL Accounts")
            
            # Journal Entries
            updated = JournalEntry.objects.filter(currency_id=zwl.id).update(currency_id=zig.id)
            print(f"  - Updated {updated} Journal Entries")
            
            # AR
            updated = CustomerInvoice.objects.filter(currency_id=zwl.id).update(currency_id=zig.id)
            print(f"  - Updated {updated} Customer Invoices")
            
            updated = CustomerReceipt.objects.filter(currency_id=zwl.id).update(currency_id=zig.id)
            print(f"  - Updated {updated} Customer Receipts")
            
            # AP
            updated = Supplier.objects.filter(currency_id=zwl.id).update(currency_id=zig.id)
            print(f"  - Updated {updated} Suppliers")
            
            updated = SupplierInvoice.objects.filter(currency_id=zwl.id).update(currency_id=zig.id)
            print(f"  - Updated {updated} Supplier Invoices")
            
            updated = SupplierPayment.objects.filter(currency_id=zwl.id).update(currency_id=zig.id)
            print(f"  - Updated {updated} Supplier Payments")

            # Exchange Rates
            updated = ExchangeRate.objects.filter(currency_id=zwl.id).update(currency_id=zig.id)
            print(f"  - Updated {updated} Exchange Rates")

            # Check for other apps
            try:
                from apps.rentals.models import RentalAgreement, RentalPayment
                updated = RentalAgreement.objects.filter(currency_id=zwl.id).update(currency_id=zig.id)
                print(f"  - Updated {updated} Rental Agreements")
                updated = RentalPayment.objects.filter(currency_id=zwl.id).update(currency_id=zig.id)
                print(f"  - Updated {updated} Rental Payments")
            except ImportError:
                print("  - Rentals app models not found, skipping.")

            # Delete ZWL
            print("Deleting ZWL currency...")
            zwl.delete()
            print("Deleted ZWL currency record.")

        # 5. Migrate ZAR to USD
        if zar:
            print(f"Migrating records from ZAR to USD...")
            
            # Bank Accounts (Uses to_field='code')
            updated = BankAccount.objects.filter(currency='ZAR').update(currency='USD')
            print(f"  - Updated {updated} Bank Accounts (Code based)")
            
            # Chart of Accounts
            updated = ChartOfAccount.objects.filter(currency_id=zar.id).update(currency_id=usd.id)
            print(f"  - Updated {updated} GL Accounts")
            
            # Journal Entries
            updated = JournalEntry.objects.filter(currency_id=zar.id).update(currency_id=usd.id)
            print(f"  - Updated {updated} Journal Entries")
            
            # AR
            updated = CustomerInvoice.objects.filter(currency_id=zar.id).update(currency_id=usd.id)
            print(f"  - Updated {updated} Customer Invoices")
            
            updated = CustomerReceipt.objects.filter(currency_id=zar.id).update(currency_id=usd.id)
            print(f"  - Updated {updated} Customer Receipts")
            
            # AP
            updated = Supplier.objects.filter(currency_id=zar.id).update(currency_id=usd.id)
            print(f"  - Updated {updated} Suppliers")
            
            updated = SupplierInvoice.objects.filter(currency_id=zar.id).update(currency_id=usd.id)
            print(f"  - Updated {updated} Supplier Invoices")
            
            updated = SupplierPayment.objects.filter(currency_id=zar.id).update(currency_id=usd.id)
            print(f"  - Updated {updated} Supplier Payments")

            # Exchange Rates
            updated = ExchangeRate.objects.filter(currency_id=zar.id).update(currency_id=usd.id)
            print(f"  - Updated {updated} Exchange Rates")

            # Check for other apps
            try:
                from apps.rentals.models import RentalAgreement, RentalPayment
                updated = RentalAgreement.objects.filter(currency_id=zar.id).update(currency_id=usd.id)
                print(f"  - Updated {updated} Rental Agreements")
                updated = RentalPayment.objects.filter(currency_id=zar.id).update(currency_id=usd.id)
                print(f"  - Updated {updated} Rental Payments")
            except ImportError:
                pass

            # Delete ZAR
            print("Deleting ZAR currency...")
            zar.delete()
            print("Deleted ZAR currency record.")

    print("Currency cleanup and migration completed successfully.")

if __name__ == "__main__":
    cleanup_currencies()
