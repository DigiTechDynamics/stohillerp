import os
from decimal import Decimal
from datetime import date
from django.test import TestCase
from apps.finance.services.accounting import AccountingService, PostingData, AccountingError
from apps.finance.models import Supplier, SupplierInvoice, SupplierInvoiceLine, JournalEntry
from apps.finance.tests.base_finance import FinanceBaseTestCase

class AccountsPayableTests(FinanceBaseTestCase):
    """
    Test Accounts Payable (AP) workflows, GRNI accruals, and supplier payments.
    """

    def setUp(self):
        super().setUp()
        self.service = AccountingService(user=None)
        
        # Create a mock supplier
        self.supplier, _ = Supplier.objects.get_or_create(
            name="Alpha Services",
            contact_person="John Doe",
            email="api@alpha.com",
            ap_account=self.accounts['2000']
        )

    def test_direct_supplier_invoice_post(self):
        """Verify that a standalone supplier invoice posts accurately to AP and Expenses."""
        # 1. Create Mock Invoice Header
        invoice = SupplierInvoice.objects.create(
            supplier=self.supplier,
            invoice_number="INV-001",
            invoice_date=date.today(),
            due_date=date.today(),
            currency=self.usd,
            total_amount=Decimal('115.00'),
            subtotal=Decimal('100.00'),
            status=SupplierInvoice.InvoiceStatus.DRAFT
        )

        # 2. Add Invoice Line (Net: 100, VAT: 15)
        SupplierInvoiceLine.objects.create(
            invoice=invoice,
            description="Office Supplies",
            expense_account=self.accounts['5000'],
            unit_price=Decimal('100.00'),
            tax_code=self.tax_vat,
            tax_amount=Decimal('15.00'),
            line_total=Decimal('115.00')
        )

        # 3. Post to GL
        entry = self.service.post_supplier_invoice(invoice)
        
        # Verify Post Status
        self.assertEqual(entry.status, JournalEntry.EntryStatus.POSTED)
        self.assertEqual(entry.journal.code, 'AP')

        # Verify AP balance (Asset DEBIT decrease / Liability CREDIT increase)
        self.accounts['2000'].refresh_from_db()
        self.assertEqual(self.accounts['2000'].current_balance, Decimal('115.00'))

        # Verify Expense balance (Net portion)
        self.accounts['5000'].refresh_from_db()
        self.assertEqual(self.accounts['5000'].current_balance, Decimal('100.00'))

        # Verify VAT Receivable (Input Tax)
        self.accounts['2110'].refresh_from_db()
        self.assertEqual(self.accounts['2110'].current_balance, Decimal('15.00'))

    def test_supplier_payment_with_imtt(self):
        """Verify that paying a supplier clears AP and automatically calculates 1% IMTT."""
        # 1. Setup AP Balance (Mocking previous liability)
        self.accounts['2000'].current_balance = Decimal('1000.00')
        self.accounts['2000'].save()
        self.accounts['1010'].current_balance = Decimal('5000.00')
        self.accounts['1010'].save()

        # 2. Mock Payment Request (Self-composed as service method takes it)
        class MockPayment:
            def __init__(self, supplier, amount, ref, date, bank):
                self.supplier = supplier
                self.amount = amount
                self.payment_reference = ref
                self.payment_date = date
                self.bank_account = type('obj', (object,), {'gl_account': bank})
                self.id = 999

        payment = MockPayment(self.supplier, Decimal('1000.00'), "EFT-777", date.today(), self.accounts['1010'])

        # 3. Post Payment
        entry = self.service.post_supplier_payment(payment)
        
        # Verify 1% IMTT (1000 * 0.01 = 10.00)
        imtt_line = entry.lines.filter(account=self.accounts['5810']).first()
        self.assertIsNotNone(imtt_line)
        self.assertEqual(imtt_line.amount, Decimal('10.00'))

        # Verify AP cleared (Asset Credit increase / Liability Debit decrease)
        self.accounts['2000'].refresh_from_db()
        self.assertEqual(self.accounts['2000'].current_balance, Decimal('0.00'))

        # Verify Bank deduction (Payment + IMTT = 1010.00)
        self.accounts['1010'].refresh_from_db()
        self.assertEqual(self.accounts['1010'].current_balance, Decimal('3990.00'))

    def test_grni_accrual_clearing(self):
        """Verify that a supplier invoice correctly clears GRNI accrual from Inventory receipt."""
        # 1. Simulate Inventory Receipt (Manual CR to GRNI)
        self.accounts['2130'].current_balance = Decimal('500.00') # Liability
        self.accounts['2130'].save()

        # 2. Create Invoice using GRNI Accrual account instead of direct expense
        invoice = SupplierInvoice.objects.create(
            supplier=self.supplier,
            invoice_number="GRNI-INV",
            invoice_date=date.today(),
            due_date=date.today(),
            currency=self.usd,
            total_amount=Decimal('500.00'),
            subtotal=Decimal('500.00')
        )

        SupplierInvoiceLine.objects.create(
            invoice=invoice,
            description="Products clearing GRNI",
            expense_account=self.accounts['2130'], # Clearing the Liability
            unit_price=Decimal('500.00'),
            line_total=Decimal('500.00')
        )

        # 3. Post
        self.service.post_supplier_invoice(invoice)
        
        # Verify GRNI is cleared
        self.accounts['2130'].refresh_from_db()
        self.assertEqual(self.accounts['2130'].current_balance, Decimal('0.00'))
        
        # Verify AP is recorded
        self.accounts['2000'].refresh_from_db()
        self.assertEqual(self.accounts['2000'].current_balance, Decimal('500.00'))
