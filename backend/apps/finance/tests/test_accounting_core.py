import os
from decimal import Decimal
from datetime import date
from django.test import TestCase
from apps.finance.services.accounting import AccountingService, PostingData, AccountingError
from apps.finance.models import JournalEntry, FiscalPeriod, ChartOfAccount
from apps.finance.tests.base_finance import FinanceBaseTestCase

class AccountingCoreTests(FinanceBaseTestCase):
    """
    Test core financial engine: AccountingService.
    Ensures data integrity, balancing, and period lock enforcement.
    """

    def setUp(self):
        super().setUp()
        self.service = AccountingService(user=None)

    def test_get_account_resolution(self):
        """Verify that system account keys resolve correctly via PostingProfile or Defaults."""
        # Resolves via PostingProfile (BANK_MAIN -> 1010)
        code = self.service.get_account('BANK_MAIN')
        self.assertEqual(code, '1010')
        
        # Resolves via Default (IMTT_PAYABLE -> 2120, even if not in profile)
        code = self.service.get_account('IMTT_PAYABLE')
        self.assertEqual(code, '2120')

    def test_post_balanced_entry_success(self):
        """Verify that a balanced journal entry posts successfully and updates balances."""
        initial_bank_bal = self.accounts['1010'].current_balance
        amount = Decimal('500.00')

        data = PostingData(
            description="Test Balanced Post",
            entry_date=date.today(),
            currency_code='USD'
        )
        data.add_debit('1010', amount, "Bank Increase")
        data.add_credit('1100', amount, "AR Decrease")

        entry = self.service.post_entry(data, journal_code='GJ')
        
        self.assertEqual(entry.status, JournalEntry.EntryStatus.POSTED)
        self.assertEqual(entry.reference.startswith('GJ-'), True)
        
        # Verify balances (Asset DEBIT increase)
        self.accounts['1010'].refresh_from_db()
        self.assertEqual(self.accounts['1010'].current_balance, initial_bank_bal + amount)

    def test_post_unbalanced_entry_fails(self):
        """Verify that unbalanced entries are rejected with AccountingError."""
        data = PostingData(description="Unbalanced", entry_date=date.today())
        data.add_debit('1010', Decimal('100.00'))
        data.add_credit('1100', Decimal('99.99')) # 0.01 difference

        with self.assertRaises(AccountingError) as cm:
            self.service.post_entry(data)
        
        self.assertIn("not balanced", str(cm.exception))

    def test_invalid_account_fails(self):
        """Verify that posting to non-existent account fails."""
        data = PostingData(description="Bad Account", entry_date=date.today())
        data.add_debit('9999', Decimal('100.00')) # Non-existent
        data.add_credit('1010', Decimal('100.00'))

        with self.assertRaises(AccountingError) as cm:
            self.service.post_entry(data)
        
        self.assertIn("not found", str(cm.exception))

    def test_period_lock_enforcement(self):
        """Verify that posting to a CLOSED or NON-EXISTENT period fails."""
        # 1. Close current period
        self.period.status = FiscalPeriod.PeriodStatus.CLOSED
        self.period.save()

        data = PostingData(description="Locked Period Post", entry_date=date.today())
        data.add_debit('1010', Decimal('100.00'))
        data.add_credit('1100', Decimal('100.00'))

        with self.assertRaises(AccountingError) as cm:
            self.service.post_entry(data)
        
        self.assertIn("not open", str(cm.exception).lower())

    def test_reversal_logic(self):
        """Verify that create_reversal() correctly swaps debits/credits and links entries."""
        # 1. Initial Post
        data = PostingData(description="Original Sale", entry_date=date.today())
        data.add_debit('1100', Decimal('1000.00'), "Debit AR")
        data.add_credit('4100', Decimal('1000.00'), "Credit Revenue")
        original = self.service.post_entry(data)
        
        # Check balances
        self.accounts['1100'].refresh_from_db()
        self.assertEqual(self.accounts['1100'].current_balance, Decimal('1000.00'))

        # 2. Reverse
        reversal = self.service.create_reversal(original)
        
        self.assertEqual(reversal.is_reversal, True)
        self.assertEqual(reversal.reversed_entry, original)
        
        # Asset balance should be back to 0
        self.accounts['1100'].refresh_from_db()
        self.assertEqual(self.accounts['1100'].current_balance, Decimal('0.00'))
        
        # Original status should be REVERSED
        original.refresh_from_db()
        self.assertEqual(original.status, JournalEntry.EntryStatus.REVERSED)
