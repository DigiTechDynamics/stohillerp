import os
import django
from decimal import Decimal
from datetime import date, timedelta

# Setup Django Environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.apps import apps
Lease = apps.get_model('rentals', 'Lease')
Contact = apps.get_model('crm', 'Contact')
Property = apps.get_model('properties', 'Property')
PropertyType = apps.get_model('properties', 'PropertyType')
Employee = apps.get_model('hr', 'Employee')
Department = apps.get_model('hr', 'Department')
AuditLog = apps.get_model('core', 'AuditLog')

from apps.rentals.services.billing import LeaseBillingService

def verify():
    print("--- Starting Rental Escalation Verification ---")
    today = date.today()
    
    # 1. Setup a dummy Lease that is EXACTLY 1 year old today (same month and day)
    print("Setting up test lease (1 year old)...")
    ptype, _ = PropertyType.objects.get_or_create(code='RES', defaults={'name': 'Residential'})
    prop, _ = Property.objects.get_or_create(
        reference_number='ESC-PROP-001',
        defaults={'name': 'Escalation Test Prop', 'property_type': ptype, 'status': 'occupied'}
    )
    dept, _ = Department.objects.get_or_create(code='RENT', defaults={'name': 'Rentals'})
    agent, _ = Employee.objects.get_or_create(
        employee_number='ESC-E01',
        defaults={
            'first_name': 'Escalation', 
            'last_name': 'Agent', 
            'department': dept, 
            'start_date': today - timedelta(days=500)
        }
    )
    tenant, _ = Contact.objects.get_or_create(
        email='tenant.escalation@example.com',
        defaults={'first_name': 'Esc', 'last_name': 'Tenant', 'contact_type': 'tenant'}
    )
    
    # anniversary_start is exactly 12 months ago from today
    anniversary_start = date(today.year - 1, today.month, today.day)
    
    lease, created = Lease.objects.get_or_create(
        lease_number='LSE-ESC-001',
        defaults={
            'property': prop,
            'tenant': tenant,
            'status': 'active',
            'start_date': anniversary_start,
            'monthly_rental': Decimal('10000.00'),
            'rental_escalation_rate': Decimal('10.00'), # 10% for easy math
            'invoice_day': 1,
            'managing_agent': agent
        }
    )
    if not created:
        lease.status = 'active'
        lease.start_date = anniversary_start
        lease.monthly_rental = Decimal('10000.00')
        lease.rental_escalation_rate = Decimal('10.00')
        lease.last_escalation_date = None # Reset for test
        lease.save()

    print(f"Lease {lease.lease_number} is ready. Start date: {lease.start_date}. Current Rent: {lease.monthly_rental}")

    # 2. Run the Escalation Service
    print("Running LeaseBillingService.process_escalations()...")
    results = LeaseBillingService.process_escalations(target_date=today)
    
    print(f"Service Results: {results}")

    # 3. Assertions
    print("\n--- Verifying Results ---")
    lease.refresh_from_db()
    
    # A. Check New Rent (Should be 11000.00 because 10,000 + 10%)
    if lease.monthly_rental == Decimal('11000.00'):
        print(f"[OK] Rent increased correctly to: {lease.monthly_rental}")
    else:
        print(f"[FAIL] Rent calculation incorrect. Expected 11000.00, got {lease.monthly_rental}")

    # B. Check Last Escalation Date
    if lease.last_escalation_date == today:
        print(f"[OK] last_escalation_date updated to: {lease.last_escalation_date}")
    else:
        print(f"[FAIL] last_escalation_date not updated correctly.")

    # C. Check Audit Log
    log = AuditLog.objects.filter(model_name='Lease', object_id=str(lease.id), action='update').order_by('-timestamp').first()
    if log:
        print(f"[OK] AuditLog entry found: {log.description}")
        print(f"     Changes: {log.changes}")
    else:
        print("[FAIL] No AuditLog entry found for the escalation.")

    # D. Test Idempotency (run again for same date)
    print("\nTesting idempotency (running again for same date)...")
    results2 = LeaseBillingService.process_escalations(target_date=today)
    if results2['escalations_applied'] == 0:
        print("[OK] Idempotency confirmed. Lease was skipped as expected.")
    else:
        print(f"[FAIL] Idempotency failed. Processed again: {results2}")

if __name__ == "__main__":
    verify()
