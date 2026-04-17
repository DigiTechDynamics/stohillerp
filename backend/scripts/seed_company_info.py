import os
import django
import sys
import json

# Setup Django environment
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.core.models import SystemConfig

def seed_company_info():
    print("Seeding Company Information...")
    
    configs = [
        {
            "key": "COMPANY_NAME",
            "value": "STOHILL INVESTMENTS (PVT) LTD",
            "description": "Legal trading name of the company."
        },
        {
            "key": "COMPANY_TIN",
            "value": "2000456895",
            "description": "Tax Payer Identification Number (BP Number)."
        },
        {
            "key": "COMPANY_VAT_STATUS",
            "value": "NOT REGISTERED",
            "description": "Current ZIMRA VAT registration status."
        },
        {
            "key": "VAT_RATE",
            "value": 15.5,
            "description": "Standard VAT rate percentage."
        },
        {
            "key": "COMPANY_ADDRESS",
            "value": "No. 11 Northampton Cresent, Eastlea, Harare",
            "description": "Physical headquarters address."
        },
        {
            "key": "COMPANY_CONTACT",
            "value": {
                "phone": "+263771588307",
                "email": "invoices@stohill.co.zw",
                "website": "www.stohill.co.zw"
            },
            "description": "Official contact details for invoices."
        }
    ]

    for cfg_data in configs:
        config, created = SystemConfig.objects.update_or_create(
            key=cfg_data["key"],
            defaults={
                "value": cfg_data["value"],
                "description": cfg_data["description"]
            }
        )
        status = "Created" if created else "Updated"
        print(f" - {cfg_data['key']}: {status}")

    print("Company Information seeded successfully.")

if __name__ == "__main__":
    seed_company_info()
