import csv
from django.http import HttpResponse
from django.apps import apps
from django.core.exceptions import ObjectDoesNotExist
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from decimal import Decimal

class TemplateDownloadView(APIView):
    """
    Generates sample CSV templates for various ERP modules.
    """
    permission_classes = [IsAuthenticated]

    MODULE_CONFIGS = {
        'properties': {
            'headers': ['name', 'type_code', 'status', 'address_line1', 'city', 'purchase_price'],
            'filename': 'property_template.csv'
        },
        'leases': {
            'headers': ['lease_number', 'property_ref', 'tenant_ref', 'monthly_rental', 'start_date'],
            'filename': 'lease_template.csv'
        },
        'crm': {
            'headers': ['first_name', 'last_name', 'email', 'phone', 'contact_type', 'status'],
            'filename': 'crm_contact_template.csv'
        },
        'coa': {
            'headers': ['code', 'name', 'account_type', 'account_sub_type'],
            'filename': 'chart_of_accounts_template.csv'
        },
        'assets': {
            'headers': ['code', 'name', 'category_code', 'acquisition_date', 'acquisition_cost'],
            'filename': 'fixed_asset_template.csv'
        },
        'employees': {
            'headers': ['first_name', 'last_name', 'email', 'job_title', 'status', 'employee_number'],
            'filename': 'employee_template.csv'
        },
        'statements': {
            'headers': ['date', 'description', 'reference', 'amount'],
            'filename': 'bank_statement_template.csv'
        },
        'suppliers': {
            'headers': ['name', 'email', 'phone', 'tax_number', 'payment_terms_days'],
            'filename': 'supplier_template.csv'
        },
        'customers': {
            'headers': ['first_name', 'last_name', 'email', 'phone', 'tax_number'],
            'filename': 'customer_template.csv'
        },
        'sales': {
            'headers': ['sale_reference', 'property_ref', 'buyer_email', 'sale_price', 'offer_date'],
            'filename': 'sale_transaction_template.csv'
        },
        'agents': {
            'headers': ['first_name', 'last_name', 'email', 'job_title', 'employee_number'],
            'filename': 'agent_template.csv'
        }
    }

    def get(self, request, module_name):
        config = self.MODULE_CONFIGS.get(module_name)
        if not config:
            return Response(
                {"error": f"Invalid module: {module_name}. Available: {list(self.MODULE_CONFIGS.keys())}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{config["filename"]}"'

        writer = csv.writer(response)
        writer.writerow(config['headers'])
        
        # Add a sample row
        samples = {
            'properties': ['Sample Luxury Villa', 'RES', 'available', '123 Ocean Drive', 'Cape Town', '5000000'],
            'leases': ['LSE-001', 'PROP-001', 'TEN-001', '15000', '2026-01-01'],
            'crm': ['John', 'Doe', 'john.doe@example.com', '0123456789', 'lead', 'active'],
            'coa': ['1100', 'Accounts Receivable', 'asset', 'receivable'],
            'assets': ['FA-001', 'Office Laptop', 'IT', '2026-01-01', '25000'],
            'employees': ['Jane', 'Smith', 'jane.smith@stohill.com', 'Agent', 'active', 'EMP-001'],
            'statements': ['2026-03-01', 'Rent Received', 'INV-123', '15000.00'],
            'suppliers': ['Global Supplies Ltd', 'info@globalsupplies.com', '0112233445', 'TAX999', '30'],
            'customers': ['Alice', 'Wonder', 'alice@example.com', '0998877665', 'TX-123']
        }
        if module_name in samples:
            writer.writerow(samples[module_name])

        return response

class DataExportView(APIView):
    """
    Exports existing records to CSV.
    """
    permission_classes = [IsAuthenticated]

    MODEL_MAPPINGS = {
        'properties': ('properties', 'Property', ['reference_number', 'name', 'status', 'purchase_price']),
        'leases': ('rentals', 'Lease', ['lease_number', 'monthly_rental', 'start_date', 'status']),
        'crm': ('crm', 'Contact', ['first_name', 'last_name', 'email', 'contact_type', 'status']),
        'coa': ('finance', 'ChartOfAccount', ['code', 'name', 'account_type', 'account_sub_type']),
        'assets': ('fixed_assets', 'FixedAsset', ['code', 'name', 'acquisition_date', 'acquisition_cost']),
        'employees': ('hr', 'Employee', ['first_name', 'last_name', 'email', 'job_title', 'status']),
        'statements': ('finance', 'BankTransaction', ['date', 'description', 'reference', 'amount']),
        'suppliers': ('finance', 'Supplier', ['name', 'email', 'phone', 'tax_number']),
        'customers': ('finance', 'Customer', ['first_name', 'last_name', 'email', 'phone']),
        'sales': ('sales', 'SaleTransaction', ['sale_reference', 'sale_price', 'status', 'offer_date']),
        'agents': ('hr', 'Employee', ['first_name', 'last_name', 'email', 'employee_number'])
    }

    def get(self, request, module_name):
        mapping = self.MODEL_MAPPINGS.get(module_name)
        if not mapping:
            return Response({"error": "Invalid module"}, status=status.HTTP_400_BAD_REQUEST)

        app_label, model_name, fields = mapping
        Model = apps.get_model(app_label, model_name)
        queryset = Model.objects.all()

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{module_name}_export.csv"'

        writer = csv.writer(response)
        writer.writerow(fields)

        for obj in queryset:
            row = []
            for field in fields:
                val = getattr(obj, field, '')
                if hasattr(val, 'code'): val = val.code
                elif hasattr(val, 'reference_number'): val = val.reference_number
                row.append(str(val))
            writer.writerow(row)

        return response

class DataImportView(APIView):
    """
    Imports records from uploaded CSV.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, module_name):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"error": "No file uploaded"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            decoded_file = file_obj.read().decode('utf-8').splitlines()
            reader = csv.DictReader(decoded_file)
            
            created_count = 0
            
            if module_name == 'properties':
                from apps.properties.models import Property, PropertyType
                for row in reader:
                    ptype = PropertyType.objects.get(code=row['type_code'])
                    Property.objects.create(
                        name=row['name'],
                        property_type=ptype,
                        status=row['status'],
                        address_line1=row.get('address_line1', ''),
                        city=row.get('city', ''),
                        purchase_price=row.get('purchase_price', 0)
                    )
                    created_count += 1
            elif module_name == 'coa':
                from apps.finance.models import ChartOfAccount
                for row in reader:
                    ChartOfAccount.objects.get_or_create(code=row['code'], defaults=row)
                    created_count += 1
            elif module_name == 'employees':
                from apps.hr.models import Employee
                for row in reader:
                    Employee.objects.get_or_create(employee_number=row['employee_number'], defaults=row)
                    created_count += 1
            elif module_name == 'crm':
                from apps.crm.models import Contact
                for row in reader:
                    Contact.objects.create(**row)
                    created_count += 1
            elif module_name == 'suppliers':
                from apps.finance.models import Supplier
                for row in reader:
                    Supplier.objects.get_or_create(name=row['name'], defaults=row)
                    created_count += 1
            elif module_name == 'customers':
                from apps.finance.models import Customer
                for row in reader:
                    Customer.objects.get_or_create(email=row['email'], defaults=row)
                    created_count += 1
            elif module_name == 'statements':
                from apps.finance.models import BankTransaction
                for row in reader:
                    BankTransaction.objects.create(**row)
                    created_count += 1
            elif module_name == 'sales':
                from apps.sales.models import SaleTransaction
                from apps.properties.models import Property
                from apps.crm.models import Contact
                for row in reader:
                    prop = Property.objects.get(reference_number=row['property_ref'])
                    buyer = Contact.objects.get(email=row['buyer_email'])
                    SaleTransaction.objects.create(
                        sale_reference=row['sale_reference'],
                        property=prop,
                        buyer=buyer,
                        sale_price=row['sale_price'],
                        offer_date=row['offer_date']
                    )
                    created_count += 1
            elif module_name == 'agents':
                from apps.hr.models import Employee
                for row in reader:
                    Employee.objects.get_or_create(employee_number=row['employee_number'], defaults=row)
                    created_count += 1
            else:
                return Response({"error": f"Import for {module_name} not yet implemented"}, status=status.HTTP_501_NOT_IMPLEMENTED)

            return Response({"message": f"Successfully imported {created_count} records"}, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
