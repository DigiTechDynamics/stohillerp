from django.core.management.base import BaseCommand
from django.db import transaction
from decimal import Decimal
from apps.finance.models import (
    ChartOfAccount, TaxCode, PostingProfile
)
from apps.core.models import Currency
from apps.payroll.models import PayrollSetting, TaxBracket

class Command(BaseCommand):
    help = 'Initialize Stohil ERP for Zimbabwe Compliance (USD & ZiG)'

    def handle(self, *args, **options):
        self.stdout.write('Initializing Zimbabwe Compliance (USD & ZiG)...')
        
        with transaction.atomic():
            self._init_currencies()
            self._init_tax_codes()
            self._init_payroll_settings()
            self._init_tax_brackets()
            self._update_coa_for_zim()
            
        self.stdout.write(self.style.SUCCESS('\nZimbabwe Compliance Initialization complete!'))

    def _init_currencies(self):
        self.stdout.write('  Configuring USD and ZiG...')
        
        # Ensure USD is base
        usd, _ = Currency.objects.get_or_create(
            code='USD',
            defaults={'name': 'United States Dollar', 'symbol': '$', 'is_base': True, 'is_active': True}
        )
        if not usd.is_base:
            Currency.objects.filter(is_base=True).update(is_base=False)
            usd.is_base = True
            usd.save()
            
        # Ensure ZiG exists
        zig, _ = Currency.objects.get_or_create(
            code='ZiG',
            defaults={'name': 'Zimbabwe Gold', 'symbol': 'ZiG', 'is_base': False, 'is_active': True}
        )
        
        usd.is_active = True
        usd.save()
        zig.is_active = True
        zig.save()

    def _init_tax_codes(self):
        self.stdout.write('  Initializing Zimbabwe VAT Codes...')
        vat_payable = ChartOfAccount.objects.filter(code='2100').first()
        vat_receivable = ChartOfAccount.objects.filter(code='2110').first()
        
        codes = [
            ('VAT_STD', 'Standard VAT (Zim)', '15.00', 'Standard 15% VAT on sales and purchases'),
            ('VAT_ZERO', 'Zero Rated', '0.00', 'Zero-rated supplies (Export/Basic goods)'),
            ('VAT_EX', 'Exempt', '0.00', 'Exempt supplies (Medical/Residential rent)'),
        ]
        
        for code, name, rate, desc in codes:
            TaxCode.objects.get_or_create(
                code=code,
                defaults={
                    'name': name, 'rate': Decimal(rate), 'description': desc,
                    'collected_account': vat_payable, 'paid_account': vat_receivable
                }
            )

    def _init_payroll_settings(self):
        self.stdout.write('  Initializing Zimbabwe Payroll Settings...')
        settings = [
            ('AIDS Levy', 'aids_levy', '0.03000', 'AIDS Levy (3% of PAYE)'),
            ('NSSA Rate (Employee)', 'nssa_ee', '0.04500', 'NSSA Employee Contribution Rate'),
            ('NSSA Rate (Employer)', 'nssa_er', '0.04500', 'NSSA Employer Contribution Rate'),
            ('NSSA Cap (Monthly USD)', 'nssa_cap', '700.00000', 'NSSA Monthly Insurable Earnings Cap (placeholder)'),
            ('ZIMDEF Levy', 'zimdef', '0.01000', 'ZIMDEF Levy (Employer only)'),
            ('IMTT Rate (USD)', 'imtt_usd', '0.01000', 'Intermediated Money Transfer Tax on USD transfers'),
            ('IMTT Rate (ZiG)', 'imtt_zig', '0.02000', 'Intermediated Money Transfer Tax on ZiG transfers (formerly 2%)'),
        ]
        for name, key, val, desc in settings:
            PayrollSetting.objects.get_or_create(
                key=key,
                defaults={'name': name, 'value': Decimal(val), 'description': desc}
            )

    def _init_tax_brackets(self):
        self.stdout.write('  Initializing ZIMRA PAYE Brackets (Monthly USD)...')
        usd = Currency.objects.get(code='USD')
        # Monthly brackets for USD 2024
        brackets = [
            (Decimal('0'), Decimal('100'), Decimal('0'), Decimal('0')),
            (Decimal('101'), Decimal('300'), Decimal('20'), Decimal('20')),
            (Decimal('301'), Decimal('1000'), Decimal('25'), Decimal('35')),
            (Decimal('1001'), Decimal('2000'), Decimal('30'), Decimal('85')),
            (Decimal('2001'), Decimal('3000'), Decimal('35'), Decimal('185')),
            (Decimal('3001'), None, Decimal('40'), Decimal('335')),
        ]
        
        TaxBracket.objects.filter(currency=usd).delete()
        
        for mn, mx, rate, fixed in brackets:
            TaxBracket.objects.create(
                currency=usd,
                min_amount=mn,
                max_amount=mx,
                tax_rate=rate,
                fixed_deduction=fixed
            )
            
        # Optional: Add placeholder ZiG brackets if needed, for now we keep it focused on the transition to USD as base.

    def _update_coa_for_zim(self):
        self.stdout.write('  Updating Chart of Accounts for Zim (IMTT)...')
        liabilities = ChartOfAccount.objects.filter(code='2000').first()
        imtt_acc, _ = ChartOfAccount.objects.get_or_create(
            code='2120',
            defaults={
                'name': 'IMTT Payable',
                'account_type': 'liability',
                'account_sub_type': 'tax_liability',
                'parent': liabilities,
                'allow_direct_posting': True,
                'is_system': True
            }
        )
        profile = PostingProfile.objects.filter(is_default=True).first()
        if profile:
            vat_pay = ChartOfAccount.objects.filter(code='2100').first()
            vat_rec = ChartOfAccount.objects.filter(code='2110').first()
            if vat_pay: profile.vat_payable = vat_pay
            if vat_rec: profile.vat_receivable = vat_rec
            profile.save()
