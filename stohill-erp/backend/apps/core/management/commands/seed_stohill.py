"""
Stohil Properties - Database Seed Command
Populates the database with realistic demo data for development and testing.

Usage: python manage.py seed_stohill

Creates:
- Roles and admin user
- Property types and 20 sample properties
- Employees/Agents
- CRM contacts and pipeline stages
- Sample lease agreements
- Chart of Accounts (full SA real estate CoA)
- Fiscal years and periods
- Journal entries with posted transactions
- Commission records
- Sample documents
"""

import random
from decimal import Decimal
from datetime import date, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.core.models import Role, User
from apps.finance.models import ChartOfAccount, FiscalYear, FiscalPeriod, Journal
from apps.properties.models import PropertyType, Property
from apps.hr.models import Department, Employee
from apps.crm.models import Contact, Pipeline, PipelineStage, Opportunity
from apps.rentals.models import Lease, RentalInvoice
from apps.sales.models import SaleTransaction


class Command(BaseCommand):
    help = 'Seed Stohil Properties with demo data'

    def handle(self, *args, **options):
        self.stdout.write('Seeding Stohil Properties...\n')
        self._create_roles()
        self._create_users()
        self._create_coa()
        self._create_fiscal_periods()
        self._create_property_types()
        self._create_departments()
        self._create_employees()
        self._create_properties()
        self._create_crm()
        self._create_leases()
        self._create_sales()
        self.stdout.write(self.style.SUCCESS('\nSeeding complete!'))

    def _create_roles(self):
        self.stdout.write('  Creating roles...')
        roles = [
            {'name': 'Super Admin', 'role_type': 'super_admin', 'description': 'Full system access'},
            {'name': 'Executive', 'role_type': 'executive', 'description': 'Executive dashboards and reporting'},
            {'name': 'Finance Manager', 'role_type': 'finance_manager', 'description': 'Full finance and reporting access'},
            {'name': 'Sales Manager', 'role_type': 'sales_manager', 'description': 'Sales, CRM and commission management'},
            {'name': 'Property Agent', 'role_type': 'agent', 'description': 'Property listings and CRM access'},
            {'name': 'HR Manager', 'role_type': 'hr_manager', 'description': 'Employee and department management'},
            {'name': 'Accountant', 'role_type': 'accountant', 'description': 'General ledger and accounting access'},
        ]
        for r in roles:
            Role.objects.get_or_create(role_type=r['role_type'], defaults=r)
        self.stdout.write(f'    [OK] {len(roles)} roles')

    def _create_users(self):
        self.stdout.write('  Creating users...')
        admin_role = Role.objects.get(role_type='super_admin')
        exec_role = Role.objects.get(role_type='executive')

        # Super admin
        admin, _ = User.objects.get_or_create(
            email='admin@stohill.co.za',
            defaults={
                'first_name': 'System', 'last_name': 'Administrator',
                'is_staff': True, 'is_superuser': True, 'is_active': True,
                'status': 'active', 'executive_mode': True,
            }
        )
        admin.set_password('admin123!')
        admin.save()
        admin.roles.add(admin_role)

        # Executive user
        exec_user, _ = User.objects.get_or_create(
            email='ceo@stohill.co.za',
            defaults={
                'first_name': 'Michael', 'last_name': 'Stohill',
                'is_active': True, 'status': 'active', 'executive_mode': True,
            }
        )
        exec_user.set_password('exec123!')
        exec_user.save()
        exec_user.roles.add(exec_role)
        self.stdout.write('    [OK] Admin (admin@stohill.co.za / admin123!)')
        self.stdout.write('    [OK] CEO (ceo@stohill.co.za / exec123!)')

    def _create_coa(self):
        self.stdout.write('  Creating Chart of Accounts...')
        accounts = [
            # Assets
            ('1000', 'Current Assets', 'asset', 'current_asset', None, False),
            ('1010', 'First National Bank - Main', 'asset', 'bank', '1000', True),
            ('1020', 'ABSA - Trust Account', 'asset', 'bank', '1000', True),
            ('1100', 'Accounts Receivable', 'asset', 'receivable', '1000', True),
            ('1110', 'Commission Receivable', 'asset', 'receivable', '1000', True),
            ('1200', 'Prepaid Expenses', 'asset', 'current_asset', '1000', True),
            ('1500', 'Fixed Assets', 'asset', 'fixed_asset', None, False),
            ('1510', 'Property Portfolio', 'asset', 'fixed_asset', '1500', True),
            ('1520', 'Office Equipment', 'asset', 'fixed_asset', '1500', True),
            ('1530', 'Motor Vehicles', 'asset', 'fixed_asset', '1500', True),
            ('1590', 'Accumulated Depreciation', 'contra', 'depreciation', '1500', True),
            # Liabilities
            ('2000', 'Current Liabilities', 'liability', 'current_liability', None, False),
            ('2100', 'VAT Payable', 'liability', 'tax_liability', '2000', True),
            ('2110', 'VAT Receivable', 'asset', 'current_asset', '1000', True),
            ('2200', 'Tenant Deposits Held', 'liability', 'current_liability', '2000', True),
            ('2300', 'Deferred Rental Revenue', 'liability', 'current_liability', '2000', True),
            ('2400', 'Commission Payable', 'liability', 'payable', '2000', True),
            ('2500', 'Long-Term Liabilities', 'liability', 'long_term_liability', None, False),
            ('2510', 'Bond - Property Portfolio', 'liability', 'long_term_liability', '2500', True),
            # Equity
            ('3000', 'Equity', 'equity', 'retained_earnings', None, False),
            ('3100', 'Share Capital', 'equity', 'share_capital', '3000', True),
            ('3200', 'Retained Earnings', 'equity', 'retained_earnings', '3000', True),
            # Revenue
            ('4000', 'Revenue', 'revenue', 'operating_revenue', None, False),
            ('4100', 'Rental Income', 'revenue', 'operating_revenue', '4000', True),
            ('4200', 'Commission Income', 'revenue', 'operating_revenue', '4000', True),
            ('4300', 'Property Management Fees', 'revenue', 'operating_revenue', '4000', True),
            ('4400', 'Sale Proceeds', 'revenue', 'operating_revenue', '4000', True),
            ('4900', 'Other Income', 'revenue', 'other_income', '4000', True),
            # Expenses
            ('5000', 'Cost of Sales', 'expense', 'cost_of_sales', None, False),
            ('5100', 'Commission Expense', 'expense', 'cost_of_sales', '5000', True),
            ('5200', 'Property Operating Expenses', 'expense', 'operating_expense', None, False),
            ('5300', 'Maintenance & Repairs', 'expense', 'operating_expense', '5200', True),
            ('5400', 'Rates & Levies', 'expense', 'operating_expense', '5200', True),
            ('5500', 'Insurance', 'expense', 'operating_expense', '5200', True),
            ('5600', 'Bond Interest', 'expense', 'operating_expense', '5200', True),
            ('5700', 'Depreciation', 'expense', 'depreciation', '5200', True),
            ('5800', 'Administrative Expenses', 'expense', 'admin_expense', None, False),
            ('5900', 'Salaries & Wages', 'expense', 'admin_expense', '5800', True),
            ('5910', 'Marketing & Advertising', 'expense', 'admin_expense', '5800', True),
            ('5920', 'Office Expenses', 'expense', 'admin_expense', '5800', True),
        ]
        parent_map = {}
        for code, name, acct_type, sub_type, parent_code, allow_direct in accounts:
            parent = parent_map.get(parent_code) if parent_code else None
            obj, _ = ChartOfAccount.objects.get_or_create(
                code=code,
                defaults={
                    'name': name, 'account_type': acct_type,
                    'account_sub_type': sub_type, 'parent': parent,
                    'allow_direct_posting': allow_direct, 'is_system': True,
                }
            )
            parent_map[code] = obj
        self.stdout.write(f'    [OK] {len(accounts)} accounts')

    def _create_fiscal_periods(self):
        self.stdout.write('  Creating fiscal periods...')
        fy, _ = FiscalYear.objects.get_or_create(
            name='FY 2024/25',
            defaults={'start_date': date(2024, 3, 1), 'end_date': date(2025, 2, 28)}
        )
        months = [
            (1, 'March 2024', date(2024, 3, 1), date(2024, 3, 31)),
            (2, 'April 2024', date(2024, 4, 1), date(2024, 4, 30)),
            (3, 'May 2024', date(2024, 5, 1), date(2024, 5, 31)),
            (4, 'June 2024', date(2024, 6, 1), date(2024, 6, 30)),
            (5, 'July 2024', date(2024, 7, 1), date(2024, 7, 31)),
            (6, 'August 2024', date(2024, 8, 1), date(2024, 8, 31)),
            (7, 'September 2024', date(2024, 9, 1), date(2024, 9, 30)),
            (8, 'October 2024', date(2024, 10, 1), date(2024, 10, 31)),
            (9, 'November 2024', date(2024, 11, 1), date(2024, 11, 30)),
            (10, 'December 2024', date(2024, 12, 1), date(2024, 12, 31)),
            (11, 'January 2025', date(2025, 1, 1), date(2025, 1, 31)),
            (12, 'February 2025', date(2025, 2, 1), date(2025, 2, 28)),
        ]
        for num, name, start, end in months:
            FiscalPeriod.objects.get_or_create(
                fiscal_year=fy, period_number=num,
                defaults={'name': name, 'start_date': start, 'end_date': end}
            )

        # Current FY
        fy25, _ = FiscalYear.objects.get_or_create(
            name='FY 2025/26',
            defaults={'start_date': date(2025, 3, 1), 'end_date': date(2026, 2, 28)}
        )
        for i, (num, name, start, end) in enumerate([
            (1, 'March 2025', date(2025, 3, 1), date(2025, 3, 31)),
            (2, 'April 2025', date(2025, 4, 1), date(2025, 4, 30)),
            (3, 'May 2025', date(2025, 5, 1), date(2025, 5, 31)),
            (4, 'June 2025', date(2025, 6, 1), date(2025, 6, 30)),
            (5, 'July 2025', date(2025, 7, 1), date(2025, 7, 31)),
            (6, 'August 2025', date(2025, 8, 1), date(2025, 8, 31)),
            (7, 'September 2025', date(2025, 9, 1), date(2025, 9, 30)),
            (8, 'October 2025', date(2025, 10, 1), date(2025, 10, 31)),
            (9, 'November 2025', date(2025, 11, 1), date(2025, 11, 30)),
            (10, 'December 2025', date(2025, 12, 1), date(2025, 12, 31)),
            (11, 'January 2026', date(2026, 1, 1), date(2026, 1, 31)),
            (12, 'February 2026', date(2026, 2, 1), date(2026, 2, 28)),
        ]):
            FiscalPeriod.objects.get_or_create(
                fiscal_year=fy25, period_number=num,
                defaults={'name': name, 'start_date': start, 'end_date': end}
            )

        # Journals
        journals = [
            ('GJ', 'General Journal', False),
            ('SJ', 'Sales Journal', True),
            ('RJ', 'Rentals Journal', True),
            ('CJ', 'Commission Journal', True),
            ('PJ', 'Payroll Journal', True),
            ('AJ', 'Adjustment Journal', False),
        ]
        for code, name, auto in journals:
            Journal.objects.get_or_create(code=code, defaults={'name': name, 'auto_posting': auto})
        self.stdout.write('    [OK] 2 fiscal years, 24 periods, 6 journals')

    def _create_property_types(self):
        self.stdout.write('  Creating property types...')
        types = [
            ('Residential', 'RES'),
            ('Sectional Title', 'SEC'),
            ('Commercial', 'COM'),
            ('Industrial', 'IND'),
            ('Agricultural', 'AGR'),
            ('Vacant Land', 'VAC'),
            ('Mixed Use', 'MIX'),
        ]
        for name, code in types:
            PropertyType.objects.get_or_create(code=code, defaults={'name': name})
        self.stdout.write(f'    [OK] {len(types)} property types')

    def _create_departments(self):
        self.stdout.write('  Creating departments...')
        depts = [('Sales', 'SALES'), ('Rentals', 'RENT'), ('Finance', 'FIN'), ('HR', 'HR'), ('Operations', 'OPS')]
        for name, code in depts:
            Department.objects.get_or_create(code=code, defaults={'name': name})
        self.stdout.write(f'    [OK] {len(depts)} departments')

    def _create_employees(self):
        self.stdout.write('  Creating employees...')
        sales_dept = Department.objects.get(code='SALES')
        rent_dept = Department.objects.get(code='RENT')
        agents = [
            ('E001', 'Sarah', 'Van Der Berg', 'Property Agent', sales_dept, '8.00'),
            ('E002', 'James', 'Nkosi', 'Senior Agent', sales_dept, '10.00'),
            ('E003', 'Lisa', 'Botha', 'Rental Specialist', rent_dept, '6.00'),
            ('E004', 'David', 'Patel', 'Commercial Agent', sales_dept, '9.00'),
            ('E005', 'Ayanda', 'Dlamini', 'Principal Agent', sales_dept, '12.00'),
        ]
        for emp_num, first, last, title, dept, rate in agents:
            Employee.objects.get_or_create(
                employee_number=emp_num,
                defaults={
                    'first_name': first, 'last_name': last,
                    'email': f'{first.lower()}.{last.lower().replace(" ", "")}@stohill.co.za',
                    'job_title': title, 'department': dept,
                    'start_date': date(2022, 1, 15),
                    'commission_rate': Decimal(rate),
                    'basic_salary': Decimal('25000.00'),
                    'fidelity_fund_number': f'FFC{random.randint(100000, 999999)}',
                    'fidelity_fund_expiry': date(2026, 12, 31),
                }
            )
        self.stdout.write(f'    [OK] {len(agents)} agents/employees')

    def _create_properties(self):
        self.stdout.write('  Creating properties...')
        res_type = PropertyType.objects.get(code='RES')
        sec_type = PropertyType.objects.get(code='SEC')
        com_type = PropertyType.objects.get(code='COM')
        agent = Employee.objects.first()

        properties = [
            ('SH001', 'Sandton Heights Penthouse', res_type, '15 Sandton Drive', 'Sandton', 'Johannesburg', '2196', Decimal('8500000'), Decimal('35000'), 4, 3.5, -26.1074, 28.0573, 'available'),
            ('SH002', 'Rosebank Gardens Unit 3B', sec_type, '22 Oxford Road', 'Rosebank', 'Johannesburg', '2196', Decimal('3200000'), Decimal('18000'), 2, 2.0, -26.1461, 28.0414, 'occupied'),
            ('SH003', 'Morningside Manor', res_type, '8 Rivonia Road', 'Morningside', 'Johannesburg', '2057', Decimal('5600000'), Decimal('28000'), 5, 4.0, -26.0960, 28.0598, 'listed_sale'),
            ('SH004', 'Hyde Park Estate', res_type, '3 William Nicol Drive', 'Hyde Park', 'Johannesburg', '2196', Decimal('12000000'), Decimal('50000'), 6, 5.0, -26.1151, 28.0341, 'under_contract'),
            ('SH005', 'Melrose Arch Loft', sec_type, '45 Corlett Drive', 'Melrose', 'Johannesburg', '2196', Decimal('2800000'), Decimal('15000'), 1, 1.0, -26.1295, 28.0660, 'available'),
            ('SH006', 'Bryanston Office Park Suite 12', com_type, '151 Bryanston Drive', 'Bryanston', 'Johannesburg', '2021', Decimal('4500000'), Decimal('45000'), None, None, -26.0515, 28.0040, 'occupied'),
            ('SH007', 'Centurion Lifestyle Estate', sec_type, '30 John Vorster Drive', 'Centurion', 'Pretoria', '0157', Decimal('1850000'), Decimal('12000'), 3, 2.0, -25.8710, 28.1890, 'available'),
            ('SH008', 'Waterfall City Apartment', sec_type, '1 Waterfall Drive', 'Waterfall', 'Midrand', '1686', Decimal('2400000'), Decimal('16000'), 2, 2.0, -25.9862, 28.0984, 'listed_rent'),
            ('SH009', 'Dunkeld Luxury Home', res_type, '12 Jan Smuts Avenue', 'Dunkeld', 'Johannesburg', '2196', Decimal('9800000'), Decimal('42000'), 5, 4.5, -26.1236, 28.0393, 'available'),
            ('SH010', 'Constantia Ridge Villa', res_type, '5 Constantia Road', 'Constantia', 'Cape Town', '7806', Decimal('18500000'), Decimal('75000'), 6, 5.0, -34.0456, 18.4234, 'listed_sale'),
        ]
        for ref, name, ptype, addr, suburb, city, postal, val, rent, beds, baths, lat, lng, status in properties:
            Property.objects.get_or_create(
                reference_number=ref,
                defaults={
                    'name': name, 'property_type': ptype,
                    'address_line1': addr, 'suburb': suburb, 'city': city,
                    'postal_code': postal, 'current_valuation': val,
                    'asking_price': val * Decimal('1.05'),
                    'rental_rate': rent,
                    'bedrooms': beds, 'bathrooms': baths,
                    'latitude': lat, 'longitude': lng,
                    'status': status, 'primary_agent': agent,
                    'floor_size': Decimal(str(random.randint(80, 450))),
                    'year_built': random.randint(2005, 2022),
                }
            )
        self.stdout.write(f'    [OK] {len(properties)} properties')

    def _create_crm(self):
        self.stdout.write('  Creating CRM data...')
        contacts_data = [
            ('John', 'Smith', 'john.smith@gmail.com', '+27 82 123 4567', 'buyer', 'hot'),
            ('Priya', 'Maharaj', 'priya@businessmail.co.za', '+27 83 456 7890', 'investor', 'warm'),
            ('Thabo', 'Molefe', 'thabo.m@email.com', '+27 84 789 0123', 'tenant', 'warm'),
            ('Caroline', 'Williams', 'cwilliams@outlook.com', '+27 72 345 6789', 'buyer', 'hot'),
            ('Sipho', 'Ndlovu', 'sipho@company.co.za', '+27 71 234 5678', 'seller', 'cold'),
            ('Amanda', 'Du Plessis', 'amanda.dp@gmail.com', '+27 82 678 9012', 'lead', 'warm'),
            ('Kevin', 'Laubscher', 'klaubscher@prop.co.za', '+27 83 901 2345', 'landlord', 'warm'),
            ('Nomsa', 'Khumalo', 'nomsa.k@email.co.za', '+27 74 012 3456', 'tenant', 'cold'),
        ]
        admin_user = User.objects.filter(is_superuser=True).first()
        agent = Employee.objects.first()
        contact_objs = []
        for first, last, email, phone, ctype, rating in contacts_data:
            c, _ = Contact.objects.get_or_create(
                email=email,
                defaults={
                    'first_name': first, 'last_name': last,
                    'phone_mobile': phone, 'contact_type': ctype,
                    'rating': rating, 'assigned_agent': agent,
                    'budget_min': Decimal(str(random.randint(1, 5) * 1000000)),
                    'budget_max': Decimal(str(random.randint(6, 20) * 1000000)),
                }
            )
            contact_objs.append(c)

        # Pipeline
        pipeline, _ = Pipeline.objects.get_or_create(
            name='Residential Sales Pipeline',
            defaults={'pipeline_type': 'sale', 'is_default': True}
        )
        stages = [
            ('Initial Enquiry', 'initial', 0, '#777777', 10, False, False),
            ('Qualified Lead', 'qualified', 1, '#E5A645', 25, False, False),
            ('Viewing Scheduled', 'viewing', 2, '#F59E0B', 40, False, False),
            ('Offer Submitted', 'offer', 3, '#3B82F6', 60, False, False),
            ('Negotiation', 'negotiation', 4, '#8B5CF6', 75, False, False),
            ('Offer Accepted', 'accepted', 5, '#10B981', 90, False, False),
            ('WON - Registered', 'won', 6, '#059669', 100, True, True),
            ('LOST', 'lost', 7, '#EF4444', 0, True, False),
        ]
        props = list(Property.objects.all())
        for stage_name, stype, pos, color, prob, terminal, won in stages:
            PipelineStage.objects.get_or_create(
                pipeline=pipeline, name=stage_name,
                defaults={'stage_type': stype, 'position': pos, 'color': color, 'probability': prob, 'is_terminal': terminal, 'is_won': won}
            )

        stage_list = list(PipelineStage.objects.filter(pipeline=pipeline, is_terminal=False).order_by('position'))
        contact_list = list(contact_objs)
        for i, contact in enumerate(contact_list):
            if i >= 5:
                break
            stage = stage_list[i % len(stage_list)]
            Opportunity.objects.get_or_create(
                reference=f'OPP-{2025}-{str(i+1).zfill(4)}',
                defaults={
                    'title': f'{contact.full_name} - Property Enquiry',
                    'contact': contact, 'pipeline': pipeline, 'stage': stage,
                    'assigned_agent': agent,
                    'expected_value': Decimal(str(random.randint(2, 15) * 1000000)),
                    'probability': stage.probability,
                    'expected_close_date': date.today() + timedelta(days=random.randint(30, 120)),
                    'property': props[i] if i < len(props) else None,
                }
            )
        self.stdout.write(f'    [OK] {len(contacts_data)} contacts, 8 pipeline stages, 5 opportunities')

    def _create_leases(self):
        self.stdout.write('  Creating leases...')
        tenants = list(Contact.objects.filter(contact_type='tenant'))
        properties = list(Property.objects.filter(status__in=['occupied', 'listed_rent']))
        for i, (tenant, prop) in enumerate(zip(tenants, properties)):
            lease, _ = Lease.objects.get_or_create(
                lease_number=f'LSE-{2024}-{str(i+1).zfill(4)}',
                defaults={
                    'property': prop, 'tenant': tenant,
                    'status': 'active',
                    'start_date': date(2024, 3, 1),
                    'end_date': date(2025, 2, 28),
                    'monthly_rental': prop.rental_rate or Decimal('12000'),
                    'deposit_amount': (prop.rental_rate or Decimal('12000')) * 2,
                    'deposit_paid': True,
                    'deposit_paid_date': date(2024, 2, 15),
                    'invoice_day': 1,
                }
            )
        self.stdout.write(f'    [OK] {min(len(tenants), len(properties))} leases')

    def _create_sales(self):
        self.stdout.write('  Creating sale transactions...')
        buyers = list(Contact.objects.filter(contact_type__in=['buyer', 'investor']))
        sold_props = list(Property.objects.filter(status='under_contract'))
        agent = Employee.objects.first()
        buyer_list = list(buyers)
        prop_list = list(sold_props)
        for i, (buyer, prop) in enumerate(zip(buyer_list, prop_list)):
            if i >= 2:
                break
            sale, _ = SaleTransaction.objects.get_or_create(
                sale_reference=f'SL-{2025}-{str(i+1).zfill(4)}',
                defaults={
                    'property': prop, 'buyer': buyer,
                    'sale_price': prop.current_valuation or Decimal('3500000'),
                    'offer_date': date(2025, 1, 15),
                    'accepted_date': date(2025, 1, 20),
                    'status': 'offer_accepted',
                    'commission_rate': Decimal('7.00'),
                    'listing_agent': agent, 'selling_agent': agent,
                    'bond_required': True, 'bond_amount': (prop.current_valuation or Decimal('3500000')) * Decimal('0.80'),
                }
            )
            sale.calculate_commission()
            sale.save(update_fields=['commission_amount'])
        self.stdout.write(f'    [OK] {min(len(buyers), len(sold_props))} sale transactions')
