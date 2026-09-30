"""
CSV templates, export and import for master data.

Import used to write raw CSV rows straight into models (`Model.objects.create(**row)`),
bypassing validation, and two options pointed at models that don't exist.
Every row now goes through the module's API serializer, so an import obeys
the same rules as the screens. The file is all-or-nothing: if any row fails,
nothing is saved and every error is reported with its row number. Rows whose
natural key already exists are skipped, so re-running an import is safe.

Access: templates for everyone; export and import need the admin module
(utils/permissions.py policy for core/).
"""

import csv
import io
from dataclasses import dataclass, field
from typing import Callable

from django.db import transaction
from django.http import HttpResponse
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView


@dataclass
class ImportSpec:
    headers: list
    sample: list
    serializer: Callable          # returns the serializer class (lazy import)
    to_data: Callable             # CSV row dict -> serializer data (may raise ValueError)
    exists: Callable              # CSV row dict -> bool (natural key already present)
    queryset: Callable = None     # for export
    export_fields: list = field(default_factory=list)


# ─── row mappers ──────────────────────────────────────────────────────────────

def _get(model_path, **lookup):
    from django.apps import apps
    model = apps.get_model(model_path)
    obj = model.objects.filter(**lookup).first()
    if obj is None:
        pretty = ', '.join(f'{k}={v!r}' for k, v in lookup.items())
        raise ValueError(f'{model.__name__} not found ({pretty})')
    return obj.pk


def _profile_account(field_name, fallback_code):
    from apps.finance.models import ChartOfAccount, PostingProfile
    profile = PostingProfile.objects.filter(is_default=True).first()
    account = getattr(profile, field_name, None) if profile else None
    return (account or ChartOfAccount.objects.get(code=fallback_code)).pk


def _property(row):
    return {
        'name': row['name'], 'property_type_id': _get('properties.PropertyType', code=row['type_code']),
        'status': row.get('status') or 'available', 'address_line1': row['address_line1'],
        'city': row.get('city', ''), 'purchase_price': row.get('purchase_price') or None,
    }


def _lease(row):
    return {
        'property': _get('properties.Property', reference_number=row['property_ref']),
        'tenant': _get('crm.Contact', email=row['tenant_email']),
        'monthly_rental': row['monthly_rental'], 'start_date': row['start_date'],
        'end_date': row.get('end_date') or None, 'deposit_amount': row.get('deposit_amount') or '0',
        'status': row.get('status') or 'draft',
    }


def _contact(row):
    return {
        'first_name': row['first_name'], 'last_name': row['last_name'], 'email': row.get('email', ''),
        'phone_mobile': row.get('phone', ''), 'contact_type': row.get('contact_type') or 'lead',
        'status': row.get('status') or 'active',
    }


def _account(row):
    data = {'code': row['code'], 'name': row['name'], 'account_type': row['account_type'],
            'account_sub_type': row['account_sub_type']}
    if row.get('parent_code'):
        data['parent'] = _get('finance.ChartOfAccount', code=row['parent_code'])
    return data


def _asset(row):
    return {
        'code': row['code'], 'name': row['name'],
        'category': _get('fixed_assets.AssetCategory', code=row['category_code']),
        'acquisition_date': row['acquisition_date'], 'acquisition_cost': row['acquisition_cost'],
    }


def _employee(row):
    return {
        'first_name': row['first_name'], 'last_name': row['last_name'], 'email': row['email'],
        'phone': row.get('phone', ''), 'employee_number': row['employee_number'],
        'start_date': row['start_date'], 'employment_type': row.get('employment_type') or 'full_time',
    }


def _statement(row):
    return {
        'bank_account': _get('finance.BankAccount', account_number=row['bank_account_number']),
        'date': row['date'], 'description': row['description'],
        'reference': row.get('reference', ''), 'amount': row['amount'],
    }


def _supplier(row):
    return {
        'name': row['name'], 'email': row.get('email', ''), 'phone': row.get('phone', ''),
        'tax_number': row.get('tax_number', ''), 'payment_terms_days': row.get('payment_terms_days') or 30,
        'ap_account': _profile_account('accounts_payable', '2010'),
    }


def _customer(row):
    # Customers are CRM contacts with an AR profile; the contact is created in
    # CustomerImportSerializer so both are validated together.
    return {
        'first_name': row['first_name'], 'last_name': row['last_name'], 'email': row['email'],
        'phone': row.get('phone', ''), 'tax_number': row.get('tax_number', ''),
        'payment_terms_days': row.get('payment_terms_days') or 30,
    }


def _sale(row):
    return {
        'sale_reference': row['sale_reference'],
        'property': _get('properties.Property', reference_number=row['property_ref']),
        'buyer': _get('crm.Contact', email=row['buyer_email']),
        'sale_price': row['sale_price'], 'offer_date': row['offer_date'],
    }


def _customer_serializer():
    from rest_framework import serializers

    from apps.crm.models import Contact
    from apps.finance.models import CustomerProfile

    class CustomerImportSerializer(serializers.Serializer):
        first_name = serializers.CharField(max_length=100)
        last_name = serializers.CharField(max_length=100)
        email = serializers.EmailField()
        phone = serializers.CharField(allow_blank=True, required=False)
        tax_number = serializers.CharField(allow_blank=True, required=False)
        payment_terms_days = serializers.IntegerField(min_value=0)

        def create(self, data):
            contact = Contact.objects.create(
                first_name=data['first_name'], last_name=data['last_name'], email=data['email'],
                phone_mobile=data.get('phone', ''), contact_type=Contact.ContactType.BUYER)
            return CustomerProfile.objects.create(
                contact_link=contact, name=f"{data['first_name']} {data['last_name']}",
                tax_number=data.get('tax_number', ''), payment_terms_days=data['payment_terms_days'],
                ar_account_id=_profile_account('accounts_receivable', '1100'))

    return CustomerImportSerializer


def _exists(model_path, **lookup):
    from django.apps import apps
    return apps.get_model(model_path).objects.filter(**lookup).exists()


def _s(path):
    """Lazy serializer import: 'app.serializers:Class'."""
    def load():
        import importlib
        module, cls = path.split(':')
        return getattr(importlib.import_module(module), cls)
    return load


def _qs(model_path):
    def load():
        from django.apps import apps
        return apps.get_model(model_path).objects.all()
    return load


SPECS = {
    'properties': ImportSpec(
        ['name', 'type_code', 'status', 'address_line1', 'city', 'purchase_price'],
        ['Sample Villa', 'RES', 'available', '12 Enterprise Road', 'Harare', '250000'],
        _s('apps.properties.serializers:PropertyDetailSerializer'), _property,
        lambda r: False, _qs('properties.Property'),
        ['reference_number', 'name', 'status', 'address_line1', 'city', 'purchase_price']),
    'leases': ImportSpec(
        ['property_ref', 'tenant_email', 'monthly_rental', 'start_date', 'end_date', 'deposit_amount', 'status'],
        ['PROP-0001', 'tenant@example.com', '850', '2026-01-01', '2026-12-31', '850', 'draft'],
        _s('apps.rentals.serializers:LeaseSerializer'), _lease, lambda r: False, _qs('rentals.Lease'),
        ['lease_number', 'monthly_rental', 'start_date', 'end_date', 'status']),
    'crm': ImportSpec(
        ['first_name', 'last_name', 'email', 'phone', 'contact_type', 'status'],
        ['John', 'Doe', 'john.doe@example.com', '+263771234567', 'lead', 'active'],
        _s('apps.crm.serializers:ContactSerializer'), _contact,
        lambda r: bool(r.get('email')) and _exists('crm.Contact', email=r['email']), _qs('crm.Contact'),
        ['first_name', 'last_name', 'email', 'phone_mobile', 'contact_type', 'status']),
    'coa': ImportSpec(
        ['code', 'name', 'account_type', 'account_sub_type', 'parent_code'],
        ['5930', 'Security Services', 'expense', 'operating_expense', '5800'],
        _s('apps.finance.serializers:ChartOfAccountSerializer'), _account,
        lambda r: _exists('finance.ChartOfAccount', code=r['code']), _qs('finance.ChartOfAccount'),
        ['code', 'name', 'account_type', 'account_sub_type']),
    'assets': ImportSpec(
        ['code', 'name', 'category_code', 'acquisition_date', 'acquisition_cost'],
        ['FA-001', 'Office Laptop', 'IT', '2026-01-01', '1200'],
        _s('apps.fixed_assets.serializers:FixedAssetSerializer'), _asset,
        lambda r: _exists('fixed_assets.FixedAsset', code=r['code']), _qs('fixed_assets.FixedAsset'),
        ['code', 'name', 'acquisition_date', 'acquisition_cost', 'status']),
    'employees': ImportSpec(
        ['first_name', 'last_name', 'email', 'phone', 'employee_number', 'start_date', 'employment_type'],
        ['Jane', 'Smith', 'jane.smith@example.com', '+263772000000', 'EMP-0100', '2026-01-01', 'full_time'],
        _s('apps.hr.serializers:EmployeeSerializer'), _employee,
        lambda r: _exists('hr.Employee', employee_number=r['employee_number']), _qs('hr.Employee'),
        ['employee_number', 'first_name', 'last_name', 'email', 'status']),
    'statements': ImportSpec(
        ['bank_account_number', 'date', 'description', 'reference', 'amount'],
        ['000111', '2026-03-01', 'Rent received', 'INV-123', '850.00'],
        _s('apps.finance.serializers:BankTransactionSerializer'), _statement, lambda r: False,
        _qs('finance.BankTransaction'), ['date', 'description', 'reference', 'amount', 'is_reconciled']),
    'suppliers': ImportSpec(
        ['name', 'email', 'phone', 'tax_number', 'payment_terms_days'],
        ['Global Supplies Ltd', 'info@example.com', '+263242000000', 'TAX999', '30'],
        _s('apps.finance.serializers:SupplierSerializer'), _supplier,
        lambda r: _exists('finance.Supplier', name=r['name']), _qs('finance.Supplier'),
        ['name', 'email', 'phone', 'tax_number', 'payment_terms_days']),
    'customers': ImportSpec(
        ['first_name', 'last_name', 'email', 'phone', 'tax_number', 'payment_terms_days'],
        ['Alice', 'Moyo', 'alice@example.com', '+263773000000', '', '30'],
        _customer_serializer, _customer,
        lambda r: _exists('finance.CustomerProfile', contact_link__email=r['email']),
        _qs('finance.CustomerProfile'), ['name', 'tax_number', 'payment_terms_days', 'credit_limit']),
    'sales': ImportSpec(
        ['sale_reference', 'property_ref', 'buyer_email', 'sale_price', 'offer_date'],
        ['SALE-0100', 'PROP-0001', 'buyer@example.com', '250000', '2026-03-01'],
        _s('apps.sales.serializers:SaleTransactionSerializer'), _sale,
        lambda r: _exists('sales.SaleTransaction', sale_reference=r['sale_reference']),
        _qs('sales.SaleTransaction'), ['sale_reference', 'sale_price', 'status', 'offer_date']),
}
SPECS['agents'] = SPECS['employees']

# Template columns a file may leave out (the mappers use a default).
OPTIONAL_COLUMNS = {'status', 'end_date', 'deposit_amount', 'parent_code', 'phone', 'tax_number', 'reference',
                    'employment_type', 'payment_terms_days', 'city', 'purchase_price'}


def _unknown(module_name):
    return Response({'error': f'Unknown module {module_name!r}. Available: {sorted(SPECS)}'},
                    status=status.HTTP_400_BAD_REQUEST)


def _csv_response(filename):
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


class TemplateDownloadView(APIView):
    """GET core/data/template/<module>/ - header row plus one sample row."""

    def get(self, request, module_name):
        spec = SPECS.get(module_name)
        if not spec:
            return _unknown(module_name)
        response = _csv_response(f'{module_name}_template.csv')
        writer = csv.writer(response)
        writer.writerow(spec.headers)
        writer.writerow(spec.sample)
        return response


class DataExportView(APIView):
    """GET core/data/export/<module>/"""

    def get(self, request, module_name):
        spec = SPECS.get(module_name)
        if not spec:
            return _unknown(module_name)
        response = _csv_response(f'{module_name}_export.csv')
        writer = csv.writer(response)
        writer.writerow(spec.export_fields)
        for obj in spec.queryset().iterator():
            writer.writerow([getattr(obj, f, '') for f in spec.export_fields])
        return response


class DataImportView(APIView):
    """
    POST core/data/import/<module>/ with a CSV `file`.

    200: {"created": n, "skipped": n}
    400: {"error": ..., "row_errors": [{"row": 2, "errors": {...}}]}  (nothing saved)
    """

    def post(self, request, module_name):
        spec = SPECS.get(module_name)
        if not spec:
            return _unknown(module_name)
        upload = request.FILES.get('file')
        if not upload:
            return Response({'error': 'No file uploaded'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            text = upload.read().decode('utf-8-sig')
        except UnicodeDecodeError:
            return Response({'error': 'The file must be UTF-8 encoded CSV.'}, status=status.HTTP_400_BAD_REQUEST)

        reader = csv.DictReader(io.StringIO(text))
        required_missing = [h for h in spec.headers
                            if h not in (reader.fieldnames or []) and h not in OPTIONAL_COLUMNS]
        if required_missing:
            return Response({'error': f'Missing columns: {", ".join(required_missing)}',
                             'expected': spec.headers}, status=status.HTTP_400_BAD_REQUEST)

        serializer_class = spec.serializer()
        valid, row_errors, skipped = [], [], 0
        for line_no, raw in enumerate(reader, start=2):  # row 1 is the header
            row = {k: (v or '').strip() for k, v in raw.items() if k}
            if not any(row.values()):
                continue
            try:
                if spec.exists(row):
                    skipped += 1
                    continue
                data = spec.to_data(row)
            except (KeyError, ValueError) as e:
                row_errors.append({'row': line_no, 'errors': {'detail': str(e)}})
                continue
            serializer = serializer_class(data=data, context={'request': request})
            if serializer.is_valid():
                valid.append(serializer)
            else:
                row_errors.append({'row': line_no, 'errors': serializer.errors})

        if row_errors:
            return Response({'error': f'{len(row_errors)} row(s) failed validation; nothing was imported.',
                             'row_errors': row_errors[:200]}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            for serializer in valid:
                serializer.save()
        return Response({'message': f'Imported {len(valid)} record(s), skipped {skipped} existing.',
                         'created': len(valid), 'skipped': skipped}, status=status.HTTP_201_CREATED)
