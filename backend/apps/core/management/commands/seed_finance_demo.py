"""
manage.py seed_finance_demo  -  finance transactions for testing the Finance module.

Run after `seed_demo` (it needs its properties, contacts and employees).
Refuses to run when DEBUG is off unless --force is given, and refuses to run
twice (the opening-balance entry marks a seeded database).

Everything posts through the same services the UI uses (rental billing,
rental payments, AR/AP posting and settlement, AccountingService.post_entry),
inside one transaction: a failure leaves the database unchanged.

Covers the previous fiscal year and the current one up to the end of last
month, so statements have comparatives:

- Opening balances (fixed assets, bank, bond, share capital, retained earnings)
- 4 leases billed monthly (one commercial with VAT), deposits, escalations,
  tenant payments (one tenant pays late and falls into arrears)
- Management-fee and sales-commission invoices with receipts
- Supplier invoices (rates, maintenance, insurance, marketing, office) and payments
- Monthly payroll with PAYE / AIDS levy / NSSA / ZIMDEF and their remittance
- Bond interest and repayments, depreciation, monthly VAT settlement
- Budgets for the current fiscal year (for Budget vs Actual)

Recent supplier invoices and some tenant/customer invoices are left unpaid so
the AR and AP aging reports have something to show.

Usage: python manage.py seed_finance_demo [--dry-run] [--force]
"""

import random
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Q, Sum

from apps.core.models import Currency, User
from apps.crm.models import Contact
from apps.finance.models import (
    BankAccount, BudgetLine, ChartOfAccount, CustomerInvoice, CustomerInvoiceLine, CustomerReceipt,
    FiscalPeriod, JournalEntry, JournalLine, Supplier, SupplierInvoice, SupplierInvoiceLine,
    SupplierPayment, TaxCode,
)
from apps.finance.seeds import ensure_fiscal_year, fiscal_year_bounds, seed_finance_defaults
from apps.finance.services.accounting import AccountingService, PostingData
from apps.hr.models import EmployeeContract
from apps.payroll.services.zimbabwe import ZimbabweTaxService
from apps.properties.models import Property
from apps.rentals.models import Lease, RentalInvoice, RentalPayment
from apps.rentals.services.billing import BillingResult, generate_invoices_for_lease
from apps.rentals.services.finance_sync import RentalFinanceSyncService

CENT = Decimal('0.01')
MARKER = 'DEMO-FIN-OPENING'


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


class Command(BaseCommand):
    help = "Seed finance transactions for testing (development only; requires --force when DEBUG is off)."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true",
                            help="Allow running with DEBUG=False (e.g. a staging/demo server).")
        parser.add_argument("--dry-run", action="store_true",
                            help="Run everything, print the summary, then roll back.")

    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError("Refusing to seed demo data with DEBUG=False. "
                               "Use --force only on a staging/demo server, never production.")
        if JournalEntry.objects.filter(source_reference=MARKER).exists():
            raise CommandError("Finance demo data is already seeded (opening-balance entry exists).")
        if not Property.objects.exists() or not EmployeeContract.objects.filter(status='running').exists():
            raise CommandError("Run `manage.py seed_demo` first: properties and employees are needed.")

        self.rng = random.Random(42)
        self.user = User.objects.filter(is_superuser=True).first()
        self.svc = AccountingService(user=self.user)
        self.vat_rate = Decimal(str(settings.COMPANY_CONFIG.get('vat_rate', 0)))

        today = date.today()
        start_month = settings.COMPANY_CONFIG.get('fiscal_year_start_month', 3)
        current_fy_start, _, _ = fiscal_year_bounds(today, start_month)
        self.start = current_fy_start - relativedelta(years=1)            # previous FY start
        self.end = today.replace(day=1) - timedelta(days=1)                 # end of last month
        self.current_fy_start = current_fy_start

        self.stdout.write(f"Seeding finance demo data {self.start} .. {self.end}")
        with transaction.atomic():
            seed_finance_defaults()
            ensure_fiscal_year(self.start)
            self._check_periods_open()
            self._setup()
            self._opening_balances()
            self._create_leases()
            month = self.start
            while month <= self.end:
                self._run_month(month)
                month += relativedelta(months=1)
            self._budgets()
            self._summary()
            if options["dry_run"]:
                transaction.set_rollback(True)
                self.stdout.write(self.style.WARNING("Dry run: all changes rolled back."))

    # ─── Setup ───────────────────────────────────────────────────────────────

    def _check_periods_open(self):
        closed = FiscalPeriod.objects.filter(start_date__lte=self.end, end_date__gte=self.start) \
            .exclude(status=FiscalPeriod.PeriodStatus.OPEN)
        if closed.exists():
            raise CommandError(f"These periods are not open: {', '.join(p.name for p in closed)}")

    def _setup(self):
        self.usd = Currency.objects.get(code='USD')
        self.std = TaxCode.objects.get(code='STD')
        self.acct = {a.code: a for a in ChartOfAccount.objects.all()}
        self.bank = BankAccount.objects.get(gl_account__code='1010')
        BankAccount.objects.get_or_create(
            gl_account=self.acct['1020'],
            defaults={'code': 'FNB-TRUST-01', 'name': 'Trust Account', 'bank_name': 'FNB',
                      'account_number': '62000000201', 'currency': self.usd},
        )

        suppliers = [
            # key, name, email, terms
            ('rates', 'City of Harare', 'accounts@hararecity.co.zw', 30),
            ('maint', 'ProFix Maintenance (Pvt) Ltd', 'billing@profix.co.zw', 30),
            ('insure', 'Old Mutual Insurance Company', 'premiums@oldmutual.co.zw', 30),
            ('market', 'Property.co.zw Media', 'ads@property.co.zw', 14),
            ('office', 'OfficeMart Stationers', 'sales@officemart.co.zw', 30),
        ]
        self.suppliers = {}
        for key, name, email, terms in suppliers:
            self.suppliers[key], _ = Supplier.objects.get_or_create(
                name=name, defaults={'email': email, 'currency': self.usd, 'payment_terms_days': terms,
                                     'ap_account': self.acct['2010']})

        # Customers for non-rental income: a landlord paying management fees
        # and buyers paying sales commission.
        self.landlord = self._contact('Kevin', 'Laubscher', 'klaubscher@prop.co.zw', 'landlord')
        self.buyers = [
            self._contact('John', 'Smith', 'john.smith@gmail.com', 'buyer'),
            self._contact('Caroline', 'Williams', 'cwilliams@outlook.com', 'buyer'),
            self._contact('Priya', 'Maharaj', 'priya@businessmail.co.za', 'investor'),
        ]
        self.stdout.write(f"  [OK] {len(self.suppliers)} suppliers, trust bank account, customers")

    def _contact(self, first, last, email, contact_type, company=''):
        contact, _ = Contact.objects.get_or_create(
            email=email, defaults={'first_name': first, 'last_name': last,
                                   'contact_type': contact_type, 'company': company})
        return contact

    # ─── Opening balances ────────────────────────────────────────────────────

    def _opening_balances(self):
        posting = PostingData(description='Opening balances', entry_date=self.start,
                              source_reference=MARKER)
        posting.add_debit('1510', money(2400000), 'Property portfolio')
        posting.add_debit('1520', money(45000), 'Office equipment')
        posting.add_debit('1530', money(60000), 'Motor vehicles')
        posting.add_debit('1010', money(180000), 'Operating bank balance')
        posting.add_credit('2510', money(300000), 'Bond - property portfolio')
        posting.add_credit('3100', money(1000000), 'Share capital')
        posting.add_credit('3200', money(1385000), 'Retained earnings')
        self.svc.post_entry(posting, journal_code='GJ')
        self.bond_balance = money(300000)
        self.stdout.write("  [OK] opening balances")

    # ─── Leases ──────────────────────────────────────────────────────────────

    def _create_leases(self):
        leased = Lease.objects.values_list('property_id', flat=True)
        free = list(Property.objects.exclude(pk__in=leased).order_by('reference_number'))
        if len(free) < 4:
            raise CommandError("Need 4 properties without leases to create demo leases.")

        specs = [
            # first, last, company, email, rent, vat, type, start offset (months), payer profile
            ('Tendai', 'Moyo', 'Moyo Logistics (Pvt) Ltd', 'accounts@moyologistics.co.zw',
             '6500', True, Lease.LeaseType.COMMERCIAL, 0, 'prompt'),
            ('Rudo', 'Chikore', '', 'rudo.chikore@gmail.com', '1800', False, Lease.LeaseType.FIXED_TERM, 0, 'prompt'),
            ('Farai', 'Mutasa', '', 'farai.mutasa@yahoo.com', '1250', False, Lease.LeaseType.FIXED_TERM, 0, 'late'),
            ('Chipo', 'Ncube', '', 'chipo.ncube@outlook.com', '2400', False, Lease.LeaseType.FIXED_TERM, 6, 'prompt'),
        ]
        self.leases = []
        for (first, last, company, email, rent, vat, ltype, offset, payer), prop in zip(specs, free):
            tenant = self._contact(first, last, email, 'tenant', company)
            start = self.start + relativedelta(months=offset)
            rent = money(rent)
            lease = Lease.objects.create(
                property=prop, tenant=tenant, currency=self.usd, lease_type=ltype,
                status=Lease.LeaseStatus.ACTIVE, start_date=start,
                end_date=start + relativedelta(years=3) - timedelta(days=1),
                monthly_rental=rent, rental_escalation_rate=Decimal('8.00'),
                deposit_amount=rent * 2, deposit_paid=True, deposit_paid_date=start,
                vat_applicable=vat, invoice_day=1, payment_due_days=7, next_invoice_date=start,
            )
            self.svc.post_deposit_received(lease, lease.deposit_amount, entry_date=start)
            lease.payer = payer
            self.leases.append(lease)
        self.stdout.write(f"  [OK] {len(self.leases)} leases with deposits")

    # ─── Monthly activity ────────────────────────────────────────────────────

    def _run_month(self, month: date):
        month_end = month + relativedelta(months=1) - timedelta(days=1)
        self._bill_rent(month, month_end)
        self._customer_invoices(month, month_end)
        self._supplier_invoices(month, month_end)
        self._payroll(month)
        self._bond_and_depreciation(month_end)
        if month > self.start:
            self._vat_settlement(month)
        self.stdout.write(f"  [OK] {month:%B %Y}")

    def _day(self, month, day):
        """A date in `month`, never after the seed's end date (None if it would be)."""
        d = month.replace(day=min(day, 28))
        return d if d <= self.end else None

    def _bill_rent(self, month, month_end):
        for lease in self.leases:
            if lease.start_date > month:
                continue
            payer = lease.payer
            lease.refresh_from_db()
            lease.payer = payer
            generate_invoices_for_lease(lease, month, BillingResult())
            invoice = RentalInvoice.objects.get(lease=lease, period_start=month)

            months_left = (self.end.year - month.year) * 12 + self.end.month - month.month
            if lease.payer == 'prompt':
                pay_on, amount = invoice.due_date - timedelta(days=self.rng.randint(1, 5)), invoice.total_amount
            elif months_left >= 3:
                pay_on, amount = invoice.due_date + timedelta(days=self.rng.randint(10, 20)), invoice.total_amount
            elif months_left == 2:
                pay_on, amount = invoice.due_date + timedelta(days=15), money(invoice.total_amount / 2)
            else:
                continue    # the late payer's most recent invoices stay unpaid (arrears)
            if pay_on > self.end:
                continue
            RentalPayment.objects.create(
                invoice=invoice, payment_date=pay_on, amount=amount,
                payment_method=RentalPayment.PaymentMethod.EFT,
                reference=f"EFT {lease.tenant.last_name.upper()} {month:%b%y}",
            )

    def _customer_invoice(self, contact, on, lines, terms=30):
        customer = RentalFinanceSyncService.sync_tenant_to_customer(contact)
        subtotal = sum((net for _, _, net in lines), Decimal('0'))
        tax = sum((money(net * self.vat_rate) for _, _, net in lines), Decimal('0'))
        invoice = CustomerInvoice.objects.create(
            customer=customer, invoice_date=on, due_date=on + timedelta(days=terms), currency=self.usd,
            subtotal=subtotal, tax_total=tax, total_amount=subtotal + tax,
        )
        for description, account, net in lines:
            vat = money(net * self.vat_rate)
            CustomerInvoiceLine.objects.create(
                invoice=invoice, description=description, revenue_account=self.acct[account],
                quantity=1, unit_price=net, tax_code=self.std, tax_amount=vat, line_total=net + vat)
        entry = self.svc.post_customer_invoice(invoice)
        invoice.status = CustomerInvoice.InvoiceStatus.POSTED
        invoice.journal_entry = entry
        invoice.save(update_fields=['status', 'journal_entry'])
        return invoice

    def _receive(self, invoice, on, amount=None):
        if on > self.end:
            return
        amount = amount or invoice.total_amount
        receipt = CustomerReceipt.objects.create(
            customer=invoice.customer, receipt_date=on, receipt_reference=f"RCPT {invoice.invoice_number}",
            amount=amount, currency=self.usd, bank_account=self.bank)
        entry = self.svc.post_customer_receipt(receipt, allocations=[(invoice, amount)])
        receipt.status = CustomerReceipt.ReceiptStatus.POSTED
        receipt.journal_entry = entry
        receipt.save(update_fields=['status', 'journal_entry'])

    def _customer_invoices(self, month, month_end):
        # Management fee for the landlord's portfolio, paid mid-month.
        fee_on = self._day(month, 1)
        fee = self._customer_invoice(self.landlord, fee_on,
                                     [(f"Property management fee {month:%B %Y}", '4300', money(3500))], terms=14)
        self._receive(fee, fee_on + timedelta(days=12))

        # One to three property sales a month earn 5% commission; the most
        # recent ones are still unpaid.
        for _ in range(self.rng.choice([1, 2, 2, 3])):
            on = self._day(month, self.rng.randint(5, 25))
            price = money(self.rng.randint(150, 500) * 1000)
            commission = money(price * Decimal('0.05'))
            buyer = self.rng.choice(self.buyers)
            invoice = self._customer_invoice(
                buyer, on, [(f"Sales commission 5% on ${price:,.0f} property sale", '4200', commission)])
            self._receive(invoice, on + timedelta(days=self.rng.randint(20, 35)))

    def _supplier_invoice(self, supplier, on, description, account, net, vat=True):
        tax = money(net * self.vat_rate) if vat else Decimal('0.00')
        invoice = SupplierInvoice.objects.create(
            supplier=supplier, invoice_number=f"{supplier.name[:3].upper()}-{on:%y%m%d}-{self.rng.randint(100, 999)}",
            invoice_date=on, due_date=on + timedelta(days=supplier.payment_terms_days), currency=self.usd,
            subtotal=net, tax_total=tax, total_amount=net + tax,
        )
        SupplierInvoiceLine.objects.create(
            invoice=invoice, description=description, expense_account=self.acct[account], quantity=1,
            unit_price=net, tax_code=self.std if vat else None, tax_amount=tax, line_total=net + tax)
        entry = self.svc.post_supplier_invoice(invoice)
        invoice.status = SupplierInvoice.InvoiceStatus.POSTED
        invoice.journal_entry = entry
        invoice.save(update_fields=['status', 'journal_entry'])

        pay_on = invoice.due_date - timedelta(days=self.rng.randint(0, 5))
        if pay_on <= self.end:
            payment = SupplierPayment.objects.create(
                supplier=supplier, payment_date=pay_on, payment_reference=f"PAY {invoice.invoice_number}",
                amount=invoice.total_amount, currency=self.usd, bank_account=self.bank)
            entry = self.svc.post_supplier_payment(payment, allocations=[(invoice, invoice.total_amount)])
            payment.status = SupplierPayment.PaymentStatus.POSTED
            payment.journal_entry = entry
            payment.save(update_fields=['status', 'journal_entry'])

    def _supplier_invoices(self, month, month_end):
        s = self.suppliers
        self._supplier_invoice(s['rates'], self._day(month, 5), f"Rates and refuse {month:%B %Y}",
                               '5400', money(950), vat=False)
        self._supplier_invoice(s['maint'], self._day(month, self.rng.randint(6, 20)),
                               self.rng.choice(['Plumbing repairs', 'Electrical repairs', 'Roof leak repair',
                                                'Painting and touch-ups', 'Gate motor service']),
                               '5300', money(self.rng.randint(4, 20) * 100))
        self._supplier_invoice(s['office'], self._day(month, 3), f"Stationery and consumables {month:%B %Y}",
                               '5920', money(self.rng.randint(250, 450)))
        if month.month in (self.start.month,):
            self._supplier_invoice(s['insure'], self._day(month, 2), f"Annual buildings insurance {month.year}",
                                   '5500', money(7200), vat=False)
        if (month.month - self.start.month) % 3 == 0:
            self._supplier_invoice(s['market'], self._day(month, 10), "Quarterly listings and advertising",
                                   '5910', money(1500))

    def _payroll(self, month):
        on = self._day(month, 25)
        if not on:
            return
        gross = paye = aids = nssa_ee = nssa_er = zimdef = Decimal('0')
        for contract in EmployeeContract.objects.filter(status='running'):
            wage = money(contract.wage or 0)
            ee_nssa = ZimbabweTaxService.calculate_nssa(wage)
            emp_paye = ZimbabweTaxService.calculate_paye(wage - ee_nssa)
            gross += wage
            nssa_ee += ee_nssa
            paye += emp_paye
            aids += ZimbabweTaxService.calculate_aids_levy(emp_paye)
            nssa_er += ZimbabweTaxService.calculate_employer_nssa(wage)
        zimdef = ZimbabweTaxService.calculate_zimdef(gross)
        net = gross - paye - aids - nssa_ee

        posting = PostingData(description=f'Payroll {month:%B %Y}', entry_date=on, source_module='payroll',
                              source_reference=f'PAYROLL-{month:%Y%m}')
        posting.add_debit('5900', gross, 'Gross salaries')
        posting.add_debit('5905', nssa_er + zimdef, 'Employer NSSA and ZIMDEF')
        posting.add_credit('2600', paye, 'PAYE')
        posting.add_credit('2610', aids, 'AIDS levy')
        posting.add_credit('2620', nssa_ee + nssa_er, 'NSSA employee and employer')
        posting.add_credit('2640', zimdef, 'ZIMDEF')
        posting.add_credit('2630', net, 'Net salaries payable')
        self.svc.post_entry(posting, journal_code='PJ')

        pay = PostingData(description=f'Salaries paid {month:%B %Y}', entry_date=on, source_module='payroll',
                          source_reference=f'PAYROLL-{month:%Y%m}-PAY')
        pay.add_debit('2630', net, 'Net salaries paid')
        pay.add_credit('1010', net, 'Salaries bank transfer')
        self.svc.post_entry(pay, journal_code='PJ')

        # Statutory remittances on the 10th of the following month.
        remit_on = on.replace(day=10) + relativedelta(months=1)
        if remit_on <= self.end:
            remit = PostingData(description=f'ZIMRA / NSSA / ZIMDEF remittance {month:%B %Y}', entry_date=remit_on,
                                source_module='payroll', source_reference=f'PAYROLL-{month:%Y%m}-REMIT')
            remit.add_debit('2600', paye, 'PAYE remitted')
            remit.add_debit('2610', aids, 'AIDS levy remitted')
            remit.add_debit('2620', nssa_ee + nssa_er, 'NSSA remitted')
            remit.add_debit('2640', zimdef, 'ZIMDEF remitted')
            remit.add_credit('1010', paye + aids + nssa_ee + nssa_er + zimdef, 'Statutory remittances')
            self.svc.post_entry(remit, journal_code='PJ')

    def _bond_and_depreciation(self, month_end):
        if month_end > self.end:
            return
        interest = money(self.bond_balance * Decimal('0.08') / 12)
        capital = money(1500)
        bond = PostingData(description=f'Bond instalment {month_end:%B %Y}', entry_date=month_end,
                           source_reference=f'BOND-{month_end:%Y%m}')
        bond.add_debit('5600', interest, 'Bond interest')
        bond.add_debit('2510', capital, 'Bond capital repayment')
        bond.add_credit('1010', interest + capital, 'Bond debit order')
        self.svc.post_entry(bond, journal_code='GJ')
        self.bond_balance -= capital

        dep = PostingData(description=f'Depreciation {month_end:%B %Y}', entry_date=month_end,
                          source_reference=f'DEPR-{month_end:%Y%m}')
        dep.add_debit('5700', money(1750), 'Depreciation - equipment and vehicles')
        dep.add_credit('1590', money(1750), 'Accumulated depreciation')
        self.svc.post_entry(dep, journal_code='AJ')

    def _vat_settlement(self, month):
        """Pay last month's net VAT on the 25th."""
        on = self._day(month, 25)
        if not on:
            return
        prev_start = month - relativedelta(months=1)
        prev_end = month - timedelta(days=1)

        def net_balance(code):
            agg = JournalLine.objects.filter(
                account__code=code, entry__status__in=JournalEntry.LEDGER_STATUSES,
                entry__entry_date__range=(prev_start, prev_end),
            ).exclude(entry__source_reference__startswith='VAT-').aggregate(dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
            return (agg['dr'] or Decimal('0')) - (agg['cr'] or Decimal('0'))

        output_vat = -net_balance('2100')     # credit balance
        input_vat = net_balance('2110')       # debit balance
        payable = output_vat - input_vat
        if output_vat <= 0 or payable <= 0:
            return
        vat = PostingData(description=f'VAT return {prev_start:%B %Y}', entry_date=on,
                          source_reference=f'VAT-{prev_start:%Y%m}')
        vat.add_debit('2100', output_vat, 'Output VAT')
        if input_vat > 0:
            vat.add_credit('2110', input_vat, 'Input VAT')
        vat.add_credit('1010', payable, 'VAT paid to ZIMRA')
        self.svc.post_entry(vat, journal_code='GJ')

    # ─── Budgets ─────────────────────────────────────────────────────────────

    def _budgets(self):
        rent = sum((lease.monthly_rental for lease in Lease.objects.filter(pk__in=[le.pk for le in self.leases])),
                   Decimal('0'))
        payroll = sum((c.wage or 0 for c in EmployeeContract.objects.filter(status='running')), Decimal('0'))
        monthly = {
            '4100': rent, '4200': money(32000), '4300': money(3500),
            '5300': money(1200), '5400': money(950), '5910': money(500), '5920': money(350),
            '5900': money(payroll), '5600': money(1800), '5700': money(1750),
        }
        periods = FiscalPeriod.objects.filter(fiscal_year__start_date=self.current_fy_start)
        for period in periods:
            for code, amount in monthly.items():
                BudgetLine.objects.get_or_create(fiscal_period=period, account=self.acct[code],
                                                 defaults={'budgeted_amount': money(amount)})
        self.stdout.write(f"  [OK] budgets for {periods.count()} periods")

    # ─── Summary ─────────────────────────────────────────────────────────────

    def _summary(self):
        lines = JournalLine.objects.filter(entry__status__in=JournalEntry.LEDGER_STATUSES)
        agg = lines.aggregate(dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
        self.stdout.write(self.style.SUCCESS(
            f"\nDone. Journal entries: {JournalEntry.objects.count()}, "
            f"ledger debits {agg['dr']:,.2f} / credits {agg['cr']:,.2f}"
            f"{' (balanced)' if agg['dr'] == agg['cr'] else ' (NOT BALANCED)'}"))
