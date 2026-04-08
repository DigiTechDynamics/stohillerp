import os
from decimal import Decimal
from datetime import date
from django.test import TestCase
from apps.finance.services.accounting import AccountingService, PostingData, AccountingError
from apps.finance.models import JournalEntry, FiscalPeriod, ChartOfAccount
from apps.finance.tests.base_finance import FinanceBaseTestCase

class ReportsTests(FinanceBaseTestCase):
    """
    Test Financial Reporting: Trial Balance data accuracy and balancing.
    """

    def setUp(self):
        super().setUp()
        self.service = AccountingService(user=None)

    def test_trial_balance_data_accuracy(self):
        """Verify that the generated Trial Balance correctly reflects all posted ledger lines."""
        # 1. Post a Sale (Total 1150)
        s1 = PostingData(description="Sale 1", entry_date=date.today())
        s1.add_debit('1100', Decimal('1150.00')).add_credit('4100', Decimal('1000.00')).add_credit('2100', Decimal('150.00'))
        self.service.post_entry(s1)

        # 2. Post an Expense (Total 575)
        e1 = PostingData(description="Expense 1", entry_date=date.today())
        e1.add_debit('5000', Decimal('500.00')).add_debit('2110', Decimal('75.00')).add_credit('1010', Decimal('575.00'))
        self.service.post_entry(e1)

        # 3. Generate Trial Balance
        report = self.service.generate_trial_balance(self.period)
        
        # Verify Report Structure
        self.assertEqual(report['is_balanced'], True)
        self.assertEqual(Decimal(report['total_debit']), Decimal('1725.00')) # 1150 + 500 + 75
        self.assertEqual(Decimal(report['total_credit']), Decimal('1725.00')) # 1000 + 150 + 575
        
        # Verify specific account in report
        ar_in_report = next(acc for acc in report['accounts'] if acc['code'] == '1100')
        self.assertEqual(Decimal(ar_in_report['net_balance']), Decimal('1150.00'))

    def test_trial_balance_property_filter(self):
        """Verify that the Trial Balance can be filtered by specific property."""
        # Mock a property object with ID
        class MockProperty:
            def __init__(self, id, ref):
                self.id = id
                self.reference_number = ref
        
        prop1 = MockProperty(1, "PROP-W1")
        prop2 = MockProperty(2, "PROP-E1")

        # Associate transactions with properties
        # Postings with Property 1
        p1 = PostingData(description="Prop 1 Revenue", entry_date=date.today())
        p1.add_debit('1010', Decimal('500.00'), property_ref=prop1)
        p1.add_credit('4100', Decimal('500.00'), property_ref=prop1)
        self.service.post_entry(p1)

        # Postings with Property 2
        p2 = PostingData(description="Prop 2 Revenue", entry_date=date.today())
        p2.add_debit('1010', Decimal('300.00'), property_ref=prop2)
        p2.add_credit('4100', Decimal('300.00'), property_ref=prop2)
        self.service.post_entry(p2)

        # Generate TB filtered by Prop 1
        filtered_report = self.service.generate_trial_balance(self.period, property_id=1)
        
        # Should only have 500.00 total
        self.assertEqual(Decimal(filtered_report['total_debit']), Decimal('500.00'))
        self.assertEqual(Decimal(filtered_report['total_credit']), Decimal('500.00'))

        # Generate TB filtered by Prop 2
        filtered_report_p2 = self.service.generate_trial_balance(self.period, property_id=2)
        self.assertEqual(Decimal(filtered_report_p2['total_debit']), Decimal('300.00'))
