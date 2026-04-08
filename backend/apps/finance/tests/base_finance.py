import os
import django
from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from apps.finance.models import (
    FiscalYear, FiscalPeriod, ChartOfAccount, Journal, 
    PostingProfile, TaxCode, BankAccount
)
from apps.core.models import Currency

class FinanceBaseTestCase(TestCase):
    """
    Base test class for Finance module automation.
    Sets up mandatory Chart of Accounts, Fiscal Periods, and Posting Profile.
    """

    def setUp(self):
        super().setUp()
        
        # 1. Setup Currency (USD)
        self.usd, _ = Currency.objects.get_or_create(
            code='USD',
            defaults={'name': 'US Dollar', 'symbol': '$'}
        )

        # 2. Setup Fiscal Structure (Current Year)
        current_year = date.today().year
        self.fy, _ = FiscalYear.objects.get_or_create(
            name=f"FY{current_year}",
            start_date=date(current_year, 1, 1),
            end_date=date(current_year, 12, 31),
            defaults={'is_closed': False}
        )

        # 3. Setup OPEN Fiscal Periods for the entire year
        for m in range(1, 13):
            m_start = date(current_year, m, 1)
            if m == 12:
                m_end = date(current_year, 12, 31)
            else:
                m_end = date(current_year, m + 1, 1) - timedelta(days=1)
            
            FiscalPeriod.objects.get_or_create(
                fiscal_year=self.fy,
                period_number=m,
                defaults={
                    'name': m_start.strftime("%B %Y"),
                    'start_date': m_start,
                    'end_date': m_end,
                    'status': FiscalPeriod.PeriodStatus.OPEN
                }
            )
        
        self.period = FiscalPeriod.objects.get(fiscal_year=self.fy, period_number=date.today().month)

        # 4. Mandatory Journals
        self.journals = {}
        for code, name in [
            ('GJ', 'General'), ('AP', 'Purchases'), ('AR', 'Accounts Receivable'), 
            ('RJ', 'Rental'), ('CJ', 'Commissions'), ('SJ', 'Sales'), ('PJ', 'Purchases')
        ]:
            j, _ = Journal.objects.get_or_create(code=code, defaults={'name': name, 'is_active': True})
            self.journals[code] = j

        # 5. Core Chart of Accounts (Essential subset of DEFAULT_ACCOUNTS)
        self.accounts = {}
        coa_map = [
            ('1010', 'Main Bank Account', 'asset', 'bank'),
            ('1020', 'Trust Bank Account', 'asset', 'bank'),
            ('1100', 'Accounts Receivable', 'asset', 'receivable'),
            ('1120', 'Commission Receivable', 'asset', 'receivable'),
            ('1510', 'Property Inventory', 'asset', 'fixed_asset'),
            ('2000', 'Accounts Payable', 'liability', 'payable'),
            ('2100', 'VAT Payable', 'liability', 'tax_liability'),
            ('2110', 'VAT Receivable', 'asset', 'receivable'),
            ('2130', 'GRNI Accrual', 'liability', 'payable'),
            ('2200', 'Tenant Deposits', 'liability', 'payable'),
            ('2400', 'Commission Payable', 'liability', 'payable'),
            ('3000', 'Retained Earnings', 'equity', 'retained_earnings'),
            ('4100', 'Rental Income', 'revenue', 'operating_revenue'),
            ('4200', 'Commission Income', 'revenue', 'operating_revenue'),
            ('4300', 'Management Fees', 'revenue', 'operating_revenue'),
            ('4400', 'Sale Revenue', 'revenue', 'operating_revenue'),
            ('5000', 'Cost of Sales', 'expense', 'cost_of_sales'),
            ('5100', 'Commission Expense', 'expense', 'operating_expense'),
            ('5810', 'Bank Charges & IMTT', 'expense', 'admin_expense'),
        ]

        for code, name, acc_type, sub_type in coa_map:
            acc, _ = ChartOfAccount.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'account_type': acc_type,
                    'account_sub_type': sub_type,
                    'is_active': True,
                    'allow_direct_posting': True,
                    'allow_manual_entry': True
                }
            )
            self.accounts[code] = acc

        # 6. Default Posting Profile (Links labels to accounts)
        self.profile, _ = PostingProfile.objects.get_or_create(
            name="Default Profile",
            defaults={
                'is_default': True,
                'bank_main': self.accounts['1010'],
                'bank_trust': self.accounts['1020'],
                'accounts_receivable': self.accounts['1100'],
                'commission_receivable': self.accounts['1120'],
                'accounts_payable': self.accounts['2000'],
                'vat_payable': self.accounts['2100'],
                'vat_receivable': self.accounts['2110'],
                'tenant_deposits': self.accounts['2200'],
                'commission_payable': self.accounts['2400'],
                'retained_earnings': self.accounts['3000'],
                'rental_income': self.accounts['4100'],
                'commission_income': self.accounts['4200'],
                'sale_revenue': self.accounts['4400'],
                'commission_expense': self.accounts['5100'],
                'cost_of_sales': self.accounts['5000'],
                'property_inventory': self.accounts['1510'],
            }
        )

        # 7. Standard Tax Codes
        self.tax_vat, _ = TaxCode.objects.get_or_create(
            code='VAT15',
            defaults={
                'name': 'Value Added Tax (15%)',
                'rate': Decimal('15.00'),
                'is_active': True,
                'collected_account': self.accounts['2100'],
                'paid_account': self.accounts['2110']
            }
        )
        # 8. Setup Bank Account
        self.bank_account, _ = BankAccount.objects.get_or_create(
            gl_account=self.accounts['1010'],
            defaults={
                'name': 'Main Operating Account',
                'bank_name': 'Stohill Bank',
                'account_number': '1234567890',
                'currency': self.usd,
                'is_active': True
            }
        )

    def tearDown(self):
        super().tearDown()
