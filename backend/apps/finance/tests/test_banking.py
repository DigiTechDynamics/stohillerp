import os
from decimal import Decimal
from datetime import date
from django.test import TestCase
from apps.finance.services.accounting import AccountingService, PostingData, AccountingError
from apps.finance.models import JournalEntry
from apps.finance.tests.base_finance import FinanceBaseTestCase

class BankingTests(FinanceBaseTestCase):
    """
    Test Bank & Cash workflows, trust vs main banking, and automated IMTT.
    """

    def setUp(self):
        super().setUp()
        self.service = AccountingService(user=None)

    def test_bank_balance_tracking(self):
        """Verify that bank account balances accurately reflect multiple postings."""
        initial_bal = self.accounts['1010'].current_balance # 0.00
        
        # 1. Receipt (Debit Asset increase)
        d1 = PostingData(description="Deposit 1", entry_date=date.today())
        d1.add_debit('1010', Decimal('1500.00')).add_credit('1100', Decimal('1500.00'))
        self.service.post_entry(d1)
        
        self.accounts['1010'].refresh_from_db()
        self.assertEqual(self.accounts['1010'].current_balance, Decimal('1500.00'))

        # 2. Payment (Credit Asset decrease)
        d2 = PostingData(description="Withdrawal 1", entry_date=date.today())
        d2.add_credit('1010', Decimal('400.00')).add_debit('2000', Decimal('400.00'))
        self.service.post_entry(d2)

        self.accounts['1010'].refresh_from_db()
        self.assertEqual(self.accounts['1010'].current_balance, Decimal('1100.00'))

    def test_trust_vs_main_bank_separation(self):
        """Verify that Trust and Main bank accounts are tracked independently."""
        # 1. Receipt into Trust
        t1 = PostingData(description="Tenant Deposit", entry_date=date.today())
        t1.add_debit('1020', Decimal('2000.00')).add_credit('2200', Decimal('2000.00'))
        self.service.post_entry(t1)
        
        self.accounts['1010'].refresh_from_db() # Main
        self.accounts['1020'].refresh_from_db() # Trust
        self.assertEqual(self.accounts['1010'].current_balance, Decimal('0.00'))
        self.assertEqual(self.accounts['1020'].current_balance, Decimal('2000.00'))

    def test_imtt_on_payments_automated(self):
        """Verify that the IMTT 1% is applied correctly in automated payment methods."""
        # Setup balances
        self.accounts['1010'].current_balance = Decimal('10000.00')
        self.accounts['1010'].save()

        # Mock generic payment that uses post_supplier_payment or similar IMTT-triggering logic
        # In AccountingService, IMTT is currently triggerable in post_supplier_payment.
        # Let's verify it again to be absolutely sure about its math.
        
        class MockSupplier:
            def __init__(self, name, acc):
                self.name = name
                self.ap_account = type('obj', (object,), {'code': acc})
        
        class MockPayment:
            def __init__(self, supplier, amount, ref, date, bank):
                self.supplier = supplier
                self.amount = amount
                self.payment_reference = ref
                self.payment_date = date
                self.bank_account = type('obj', (object,), {'gl_account': bank})
                self.id = 555

        sup = MockSupplier("Zim Energy", '2000')
        payment = MockPayment(sup, Decimal('2500.00'), "BP-922", date.today(), self.accounts['1010'])

        # Post
        entry = self.service.post_supplier_payment(payment)
        
        # Verify 1% of 2500 = 25.00
        imtt_line = entry.lines.filter(account=self.accounts['5810']).first()
        self.assertEqual(imtt_line.amount, Decimal('25.00'))
        
        # Total Bank Credit = 2500 + 25 = 2525
        self.accounts['1010'].refresh_from_db()
        self.assertEqual(self.accounts['1010'].current_balance, Decimal('7475.00'))
