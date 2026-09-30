"""
manage.py seed_demo  -  realistic demo data for development and demos.

Refuses to run when DEBUG is off unless --force is given, so it can't
accidentally reset credentials or pollute a production database.

Demo user passwords come from SEED_ADMIN_PASSWORD / SEED_EXEC_PASSWORD, or are
generated randomly and printed once. Existing users' passwords are never reset.

Usage: python manage.py seed_demo [--force]

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

import os
import random
import secrets
from decimal import Decimal
from datetime import date, timedelta
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.core.models import Role, User
from apps.finance.models import ChartOfAccount, FiscalYear, FiscalPeriod, Journal
from apps.properties.models import PropertyType, Property
from apps.hr.models import Department, Employee, EmployeeContract, JobPosition
from apps.crm.models import Contact, Pipeline, PipelineStage, Opportunity
from apps.rentals.models import Lease, RentalInvoice
from apps.sales.models import SaleTransaction
from apps.hr.demo_seeds import seed_demo_hr
from apps.banking.demo_seeds import seed_demo_banking


class Command(BaseCommand):
    help = "Seed demo data (development only; requires --force when DEBUG is off)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force",
            action="store_true",
            help="Allow running with DEBUG=False (e.g. a staging/demo server).",
        )

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError(
                "Refusing to seed demo data with DEBUG=False. "
                "Use --force only on a staging/demo server, never production."
            )
        self.stdout.write("Seeding Stohill Properties demo data...\n")
        # Reference data first: roles, currencies, modules, sequences...
        call_command("bootstrap_system", stdout=self.stdout)
        self._create_users()
        self._create_fiscal_periods()
        self._create_property_types()
        self._create_departments()
        self._create_employees()
        self._create_properties()
        self._create_crm()
        self._create_leases()
        self._create_sales()
        self.stdout.write("  Creating HR demo data...")
        seed_demo_hr(log=lambda msg: self.stdout.write(f"    {msg}"))
        self.stdout.write("  Creating banking demo data...")
        seed_demo_banking(log=lambda msg: self.stdout.write(f"    {msg}"))
        self.stdout.write(self.style.SUCCESS("\nSeeding complete!"))

    def _demo_user(self, email, password_env, role_type, **defaults):
        """
        Create a demo user if missing. Only a newly created user gets a
        password, so re-running never resets credentials someone has changed.
        """
        user, created = User.objects.get_or_create(email=email, defaults=defaults)
        user.roles.add(Role.objects.get(role_type=role_type))
        if not created:
            self.stdout.write(f"    [--] {email} already exists (password unchanged)")
            return
        password = os.environ.get(password_env) or secrets.token_urlsafe(12)
        user.set_password(password)
        user.save(update_fields=["password"])
        shown = "(from env)" if os.environ.get(password_env) else password
        self.stdout.write(f"    [OK] {email} / {shown}")

    def _create_users(self):
        self.stdout.write("  Creating demo users...")
        self._demo_user(
            "admin@stohill.co.za", "SEED_ADMIN_PASSWORD", "super_admin",
            first_name="System", last_name="Administrator", is_staff=True,
            is_superuser=True, is_active=True, status="active", executive_mode=True,
        )
        self._demo_user(
            "ceo@stohill.co.za", "SEED_EXEC_PASSWORD", "executive",
            first_name="Michael", last_name="Stohill", is_active=True,
            status="active", executive_mode=True,
        )

    def _create_fiscal_periods(self):
        """
        Fiscal years from FY2024 up to and including the one containing today.

        Previously hardcoded to FY2024/25-FY2025/26, so after Feb 2026 nothing
        dated "today" could be posted (reversals, receipts...) in a fresh demo.
        Uses COMPANY_CONFIG["fiscal_year_start_month"] (default March).
        """
        from calendar import monthrange

        self.stdout.write('  Creating fiscal periods...')
        start_month = settings.COMPANY_CONFIG.get('fiscal_year_start_month', 3)
        today = date.today()
        current_fy_start_year = today.year if today.month >= start_month else today.year - 1

        years = periods = 0
        for fy_year in range(2024, current_fy_start_year + 1):
            fy_start = date(fy_year, start_month, 1)
            end_year, end_month = (fy_year, 12) if start_month == 1 else (fy_year + 1, start_month - 1)
            fy_end = date(end_year, end_month, monthrange(end_year, end_month)[1])
            name = f'FY {fy_year}' if start_month == 1 else f'FY {fy_year}/{str(fy_year + 1)[-2:]}'
            fy, _ = FiscalYear.objects.get_or_create(
                name=name, defaults={'start_date': fy_start, 'end_date': fy_end}
            )
            years += 1
            for num in range(1, 13):
                month_index = start_month - 1 + (num - 1)
                y, m = fy_year + month_index // 12, month_index % 12 + 1
                FiscalPeriod.objects.get_or_create(
                    fiscal_year=fy, period_number=num,
                    defaults={
                        'name': date(y, m, 1).strftime('%B %Y'),
                        'start_date': date(y, m, 1),
                        'end_date': date(y, m, monthrange(y, m)[1]),
                    },
                )
                periods += 1

        self.stdout.write(f'    [OK] {years} fiscal years, {periods} periods')

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
        """
        Agents as Employee profiles + running EmployeeContracts.
        Since the HR/Payroll refactor, pay lives on the contract (wage), not on
        the employee; commission rates live in commission structures.
        """
        self.stdout.write('  Creating employees...')
        sales_dept = Department.objects.get(code='SALES')
        rent_dept = Department.objects.get(code='RENT')
        agents = [
            # (number, first, last, position, department, monthly wage USD)
            ('E001', 'Sarah', 'Van Der Berg', 'Property Agent', sales_dept, '1800.00'),
            ('E002', 'James', 'Nkosi', 'Senior Agent', sales_dept, '2400.00'),
            ('E003', 'Lisa', 'Botha', 'Rental Specialist', rent_dept, '1600.00'),
            ('E004', 'David', 'Patel', 'Commercial Agent', sales_dept, '2200.00'),
            ('E005', 'Ayanda', 'Dlamini', 'Principal Agent', sales_dept, '3000.00'),
        ]
        for emp_num, first, last, title, dept, wage in agents:
            position, _ = JobPosition.objects.get_or_create(name=title, department=dept)
            employee, created = Employee.objects.get_or_create(
                employee_number=emp_num,
                defaults={
                    'first_name': first, 'last_name': last,
                    'email': f'{first.lower()}.{last.lower().replace(" ", "")}@stohill.co.za',
                    'department': dept, 'job_position': position,
                    'start_date': date(2022, 1, 15),
                    'fidelity_fund_number': f'FFC{random.randint(100000, 999999)}',
                    'fidelity_fund_expiry': date(2026, 12, 31),
                },
            )
            if created:
                EmployeeContract.objects.create(
                    employee=employee, job_position=position, department=dept,
                    start_date=employee.start_date, wage=Decimal(wage), status='running',
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
            # Not default: bootstrap_system owns the default "Sales Pipeline".
            defaults={'pipeline_type': 'sale', 'is_default': False}
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
                    'expected_revenue': Decimal(str(random.randint(2, 15) * 1000000)),
                    'probability': stage.probability,
                    'expected_closing': date.today() + timedelta(days=random.randint(30, 120)),
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
