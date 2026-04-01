import os
import django
from decimal import Decimal
from datetime import date, timedelta

# Setup Django Environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.apps import apps
Lease = apps.get_model('rentals', 'Lease')
RentalInvoice = apps.get_model('rentals', 'RentalInvoice')
CustomerInvoice = apps.get_model('finance', 'CustomerInvoice')
Contact = apps.get_model('crm', 'Contact')
Property = apps.get_model('properties', 'Property')
PropertyType = apps.get_model('properties', 'PropertyType')
Employee = apps.get_model('hr', 'Employee')
Department = apps.get_model('hr', 'Department')
ChartOfAccount = apps.get_model('finance', 'ChartOfAccount')
Journal = apps.get_model('finance', 'Journal')

from apps.rentals.services.billing import LeaseBillingService

def verify():
    print("--- Starting Rental Invoicing Verification (Minimal Imports) ---")
    today = date.today()
    
    # Ensuring required accounts exist for the test
    income_acc, _ = ChartOfAccount.objects.get_or_create(
        code='4100', defaults={'name': 'Rental Income', 'account_type': 'revenue', 'is_system': True}
    )
    ar_acc, _ = ChartOfAccount.objects.get_or_create(
        code='1100', defaults={'name': 'Accounts Receivable', 'account_type': 'asset', 'is_system': True}
    )
    
    # Ensure Rent Journal exists
    Journal.objects.get_or_create(code='RJ', defaults={'name': 'Rentals Journal', 'auto_posting': True})
    
    # 1. Setup a dummy Lease
    print("Setting up test lease...")
    ptype, _ = PropertyType.objects.get_or_create(code='RES', defaults={'name': 'Residential'})
    prop, _ = Property.objects.get_or_create(
        reference_number='TEST-PROP-001',
        defaults={'name': 'Verification Property', 'property_type': ptype, 'status': 'occupied'}
    )
    
    dept, _ = Department.objects.get_or_create(code='RENT', defaults={'name': 'Rentals'})
    agent, _ = Employee.objects.get_or_create(
        employee_number='VERIFY-E01',
        defaults={
            'first_name': 'Verifier', 
            'last_name': 'Agent', 
            'department': dept,
            'start_date': today - timedelta(days=365)
        }
    )
    
    tenant, _ = Contact.objects.get_or_create(
        email='tenant.verify@example.com',
        defaults={'first_name': 'Test', 'last_name': 'Tenant', 'contact_type': 'tenant'}
    )
    
    
    
    # Create or update a lease to be ACTIVE and due for invoicing
    lease, created = Lease.objects.get_or_create(
        lease_number='LSE-VERIFY-001',
        defaults={
            'property': prop,
            'tenant': tenant,
            'status': 'active',
            'start_date': today - timedelta(days=60),
            'monthly_rental': Decimal('15000.00'),
            'invoice_day': today.day,
            'next_invoice_date': today, # Due for invoicing today
            'managing_agent': agent
        }
    )
    if not created:
        lease.status = 'active'
        lease.next_invoice_date = today
        lease.save()

    print(f"Lease {lease.lease_number} is ready. Next invoice date: {lease.next_invoice_date}")

    # 2. Run the Billing Service
    print("Running LeaseBillingService.generate_monthly_invoices()...")
    results = LeaseBillingService.generate_monthly_invoices(target_date=today)
    
    print(f"Service Results: {results}")

    # 3. Assertions
    print("\n--- Verifying Results ---")
    
    # A. Check RentalInvoice
    invoice = RentalInvoice.objects.filter(lease=lease, period_start=today).first()
    if invoice:
        print(f"[OK] RentalInvoice created: {invoice.invoice_number}")
        print(f"     Amount: {invoice.total_amount}")
        print(f"     Status: {invoice.status}")
        print(f"     Posted to Finance: {invoice.is_posted_to_finance}")
        if invoice.is_posted_to_finance:
            print(f"[OK] Financial sync successful.")
        else:
            print("[FAIL] RentalInvoice exists but is not posted to finance.")
    else:
        print("[FAIL] No RentalInvoice found for the test lease.")

    # B. Check Lease status/next_date
    lease.refresh_from_db()
    if lease.next_invoice_date > today:
        print(f"[OK] Lease next_invoice_date advanced to: {lease.next_invoice_date}")
    else:
        print(f"[FAIL] Lease next_invoice_date was not advanced.")

    # C. Check for mirrored AR Invoice
    if invoice and invoice.is_posted_to_finance:
        ar_invoice = CustomerInvoice.objects.filter(journal_entry=invoice.journal_entry).first()
        if ar_invoice:
            print(f"[OK] Mirrored CustomerInvoice found: {ar_invoice.invoice_number}")
        else:
            print("[FAIL] Mirror AR Invoice not found for the generated journal entry.")

if __name__ == "__main__":
    verify()
