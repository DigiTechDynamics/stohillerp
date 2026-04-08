import os
from decimal import Decimal
from datetime import date
from django.test import TestCase
from apps.finance.services.accounting import AccountingService, PostingData, AccountingError
from apps.finance.models import JournalEntry, ChartOfAccount
from apps.finance.tests.base_finance import FinanceBaseTestCase

class PayrollFinanceTests(FinanceBaseTestCase):
    """
    Test Payroll-to-Finance GL integration: Salary journals and statutory liabilities.
    """

    def setUp(self):
        super().setUp()
        self.service = AccountingService(user=None)
        
        # Setup Payroll-specific Accounts
        self.acc_salaries_exp, _ = ChartOfAccount.objects.get_or_create(
            code='5900',
            defaults={'name': 'Salaries & Wages', 'account_type': 'expense'}
        )
        self.acc_net_pay_liability, _ = ChartOfAccount.objects.get_or_create(
            code='2500',
            defaults={'name': 'Net Salaries Payable', 'account_type': 'liability'}
        )
        self.acc_paye_liability, _ = ChartOfAccount.objects.get_or_create(
            code='2510',
            defaults={'name': 'PAYE Tax Payable', 'account_type': 'liability'}
        )

    def test_payroll_journal_gl_impact(self):
        """Verify that a salary journal records gross pay and splits net pay from statutory taxes."""
        # Gross: 3000, Net: 2400, PAYE: 600
        gross = Decimal('3000.00')
        net = Decimal('2400.00')
        paye = Decimal('600.00')
        
        data = PostingData(
            description="Payroll Journal - April 2026",
            entry_date=date.today(),
            source_module='payroll',
            source_id=1,
            source_reference="PAY-APR26",
        )
        # Debit Full Expense
        data.add_debit('5900', gross, "Gross Salaries")
        # Credit Liabilities (Splits)
        data.add_credit('2500', net, "Net Salaries - Net portion")
        data.add_credit('2510', paye, "PAYE - Tax portion")

        # Post
        self.service.post_entry(data, journal_code='GJ')
        
        # Verify
        self.acc_salaries_exp.refresh_from_db()
        self.acc_net_pay_liability.refresh_from_db()
        self.acc_paye_liability.refresh_from_db()
        
        self.assertEqual(self.acc_salaries_exp.current_balance, gross) # Expense Debit
        self.assertEqual(self.acc_net_pay_liability.current_balance, net) # Liability Credit
        self.assertEqual(self.acc_paye_liability.current_balance, paye) # Liability Credit

    def test_payroll_disbursement_clearing(self):
        """Verify that paying employees clears the Net Pay liability and credits the Bank."""
        # Setup Balance
        self.acc_net_pay_liability.current_balance = Decimal('10000.00')
        self.acc_net_pay_liability.save()

        # Payment Entry
        data = PostingData(description="Salary Disbursement", entry_date=date.today())
        # Clearing Liability (Debit Liability)
        data.add_debit('2500', Decimal('10000.00'), "Clearing salaries payable")
        # Credit Bank
        data.add_credit('1010', Decimal('10100.00'), "Total bank transfer + 1% IMTT")
        # Debit IMTT Expense (1% of 10,000 = 100)
        data.add_debit('5810', Decimal('100.00'), "IMTT on payroll")
        
        # Post
        self.service.post_entry(data)
        
        # Verify
        self.acc_net_pay_liability.refresh_from_db()
        self.assertEqual(self.acc_net_pay_liability.current_balance, Decimal('0.00')) # Liability cleared
        
        self.accounts['1010'].refresh_from_db()
        self.assertEqual(self.accounts['1010'].current_balance, Decimal('-10100.00')) # Bank Credit
