import os
from decimal import Decimal
from datetime import date
from django.test import TestCase
from apps.finance.services.accounting import AccountingService, PostingData, AccountingError
from apps.finance.models import JournalEntry
from apps.finance.tests.base_finance import FinanceBaseTestCase

class CommissionsTests(FinanceBaseTestCase):
    """
    Test Commission accruals and payments to agents.
    """

    def setUp(self):
        super().setUp()
        self.service = AccountingService(user=None)
        
        # Mock agent contact
        self.agent, _ = type('obj', (object,), {
            'full_name': 'Agent Smith',
            'id': 707
        }), True

    def test_commission_accrual_ledger_integrity(self):
        """Verify that a commission accrues as a liability and expense."""
        # 1. Setup Accrual Data
        amount = Decimal('450.00')
        data = PostingData(
            description=f"Commission Accrual - {self.agent.full_name}",
            entry_date=date.today(),
            source_module='commission',
            source_id=999,
            source_reference="C-SALE-101",
        )
        # Debit Expense, Credit Liability
        data.add_debit(self.accounts['5100'].code, amount, "Commission Expense")
        data.add_credit(self.accounts['2400'].code, amount, f"Payable to {self.agent.full_name}")

        # 2. Post
        entry = self.service.post_entry(data, journal_code='CJ')
        
        # Verify
        self.assertEqual(entry.journal.code, 'CJ')
        self.accounts['5100'].refresh_from_db()
        self.accounts['2400'].refresh_from_db()
        self.assertEqual(self.accounts['5100'].current_balance, amount) # Expense
        self.assertEqual(self.accounts['2400'].current_balance, amount) # Liability

    def test_commission_payment_automated(self):
        """Verify that paying a commission clears the liability and creates a bank credit."""
        # 1. Setup Liability Balance
        self.accounts['2400'].current_balance = Decimal('1000.00')
        self.accounts['2400'].save()

        # 2. Mock Commission Record (as used by post_commission_payment)
        class MockCommRecord:
            def __init__(self, agent, amount, ref):
                self.agent = agent
                self.net_commission = amount
                self.reference = ref
                self.payment_date = date.today()
                self.id = 808
        
        comm_record = MockCommRecord(self.agent, Decimal('1000.00'), "PAY-C-001")

        # 3. Post Payment
        entry = self.service.post_commission_payment(comm_record)
        
        # Verify Liability Cleared (Debit Liability - decrease)
        self.accounts['2400'].refresh_from_db()
        self.assertEqual(self.accounts['2400'].current_balance, Decimal('0.00'))

        # Verify Bank Credit (Asset Credit - decrease)
        self.accounts['1010'].refresh_from_db()
        self.assertEqual(self.accounts['1010'].current_balance, Decimal('-1000.00'))
