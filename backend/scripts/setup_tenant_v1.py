import os
import django
import sys
from decimal import Decimal
from datetime import date, timedelta

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.crm.models import Contact
from apps.properties.models import Property, PropertyUnit
from apps.rentals.models import Lease
from apps.core.models import Currency
from apps.hr.models import Employee
from apps.rentals.services.billing import LeaseBillingService

def setup_tenant_magaya():
    print("Starting setup for Tenant: Mellough Magaya...")
    
    # 1. References
    prop_id = "f6a5161f-0f98-4cec-b6d8-7bd68ceb4345"
    agent_id = "009446d0-e466-461a-9706-4387e487f26d"
    currency_id = "d629b234-be03-4986-82ea-1a4df92da7f0"
    
    try:
        prop = Property.objects.get(id=prop_id)
        agent = Employee.objects.get(id=agent_id)
        currency = Currency.objects.get(id=currency_id)
    except Exception as e:
        print(f"Error fetching references: {e}")
        return

    # 2. Create Unit
    unit, created = PropertyUnit.objects.get_or_create(
        property=prop,
        unit_number="Unit 101",
        defaults={
            "status": "available",
            "floor": 0,
            "bedrooms": 3,
            "bathrooms": 2.0,
            "floor_size": Decimal("120.00"),
            "monthly_rental": Decimal("600.00")
        }
    )
    print(f" - Unit 101: {'Created' if created else 'Existing'}")

    # 3. Create Contact
    contact, created = Contact.objects.get_or_create(
        first_name="Mellough",
        last_name="Magaya",
        defaults={
            "email": "mellough.magaya@example.com",
            "phone_mobile": "+263 77 000 0000",
            "contact_type": "tenant",
            "status": "active",
            "address_line1": "Sandton Crescent",
            "city": "Harare"
        }
    )
    print(f" - Contact Magaya: {'Created' if created else 'Existing'}")

    # 4. Create Lease
    lease_num = f"L-ST-101-MAG"
    start_dt = date.today()
    end_dt = start_dt + timedelta(days=365)
    
    lease, created = Lease.objects.get_or_create(
        lease_number=lease_num,
        defaults={
            "property": prop,
            "unit": unit,
            "tenant": contact,
            "currency": currency,
            "lease_type": "fixed_term",
            "status": "draft",
            "start_date": start_dt,
            "end_date": end_dt,
            "monthly_rental": Decimal("600.00"),
            "deposit_amount": Decimal("600.00"),
            "managing_agent": agent,
            "invoice_day": 1,
            "payment_due_days": 3,
            "next_invoice_date": start_dt  # Invoice immediately
        }
    )
    print(f" - Lease {lease_num}: {'Created' if created else 'Existing'}")

    # 5. Activate Lease (Syncs to unit status and prepares billing)
    if lease.status == "draft":
        lease.activate()
        print(f" - Lease Activated. Unit status updated to OCCUPIED.")

    # 6. Generate First Invoice
    print(" - Triggering Billing Service...")
    results = LeaseBillingService.generate_monthly_invoices(target_date=start_dt)
    print(f" - Billing Results: {results}")

    print("\nSetup complete for Mellough Magaya.")

if __name__ == "__main__":
    setup_tenant_magaya()
