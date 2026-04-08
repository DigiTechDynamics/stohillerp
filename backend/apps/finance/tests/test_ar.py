import os
from decimal import Decimal
from datetime import date
from django.test import TestCase
from apps.finance.services.accounting import AccountingService, PostingData, AccountingError
from apps.finance.models import CustomerProfile, CustomerInvoice, CustomerInvoiceLine, JournalEntry
from apps.finance.tests.base_finance import FinanceBaseTestCase

class AccountsReceivableTests(FinanceBaseTestCase):
    """
    Test Accounts Receivable (AR) workflows, customer invoicing, and receipts.
    """

    def setUp(self):
        super().setUp()
        self.service = AccountingService(user=None)
        
        # Create mock customer
        self.customer, _ = CustomerProfile.objects.get_or_create(
            name="Alice Wonder",
            contact_link=None, # contact_link can be null in initial setup or mock
            ar_account=self.accounts['1100']
        )

    def test_customer_invoice_post(self):
        """Verify that a customer invoice posts accurately to AR and Revenue."""
        # 1. Create Invoice
        invoice = CustomerInvoice.objects.create(
            customer=self.customer,
            invoice_number="CUST-INV-01",
            invoice_date=date.today(),
            due_date=date.today(),
            currency=self.usd,
            total_amount=Decimal('230.00'),
            subtotal=Decimal('200.00'),
            status=CustomerInvoice.InvoiceStatus.DRAFT
        )

        CustomerInvoiceLine.objects.create(
            invoice=invoice,
            description="Consulting Service",
            revenue_account=self.accounts['4100'],
            unit_price=Decimal('200.00'),
            tax_code=self.tax_vat,
            tax_amount=Decimal('30.00'),
            line_total=Decimal('230.00')
        )

        # 2. Post
        entry = self.service.post_customer_invoice(invoice)
        
        self.assertEqual(entry.status, JournalEntry.EntryStatus.POSTED)
        self.assertEqual(entry.journal.code, 'AR')

        # Verify AR (Asset DEBIT increase)
        self.accounts['1100'].refresh_from_db()
        self.assertEqual(self.accounts['1100'].current_balance, Decimal('230.00'))

        # Verify Revenue (Revenue CREDIT increase)
        self.accounts['4100'].refresh_from_db()
        self.assertEqual(self.accounts['4100'].current_balance, Decimal('200.00'))

        # Verify VAT Payable (Liability CREDIT increase)
        self.accounts['2100'].refresh_from_db()
        self.assertEqual(self.accounts['2100'].current_balance, Decimal('30.00'))

    def test_customer_receipt_allocation_fifo(self):
        """Verify that a customer receipt clears AR and correctly allocates to invoices FIFO."""
        # 1. Setup 2 Outstanding Invoices
        inv1 = CustomerInvoice.objects.create(
            customer=self.customer,
            invoice_number="OLD-001",
            invoice_date=date(2026, 1, 1),
            total_amount=Decimal('100.00'),
            status=CustomerInvoice.InvoiceStatus.POSTED
        )
        inv2 = CustomerInvoice.objects.create(
            customer=self.customer,
            invoice_number="NEW-002",
            invoice_date=date(2026, 2, 1),
            total_amount=Decimal('150.00'),
            status=CustomerInvoice.InvoiceStatus.POSTED
        )
        
        self.accounts['1100'].current_balance = Decimal('250.00')
        self.accounts['1100'].save()

        # 2. Mock Receipt Request (Service method takes it)
        class MockReceipt:
            def __init__(self, customer, amount, ref, date, bank):
                self.customer = customer
                self.amount = amount
                self.receipt_reference = ref
                self.receipt_date = date
                self.bank_account = type('obj', (object,), {'gl_account': bank})
                self.id = 101

        receipt = MockReceipt(self.customer, Decimal('125.00'), "REC-999", date.today(), self.accounts['1010'])

        # 3. Post Receipt
        self.service.post_customer_receipt(receipt)
        
        # Verify AR Balance (250 - 125 = 125)
        self.accounts['1100'].refresh_from_db()
        self.assertEqual(self.accounts['1100'].current_balance, Decimal('125.00'))

        # Verify Allocation Results
        # inv1 should be PAID (100)
        inv1.refresh_from_db()
        self.assertEqual(inv1.status, CustomerInvoice.InvoiceStatus.PAID)
        self.assertEqual(inv1.amount_paid, Decimal('100.00'))
        
        # inv2 should be PARTIAL (25)
        inv2.refresh_from_db()
        self.assertEqual(inv2.status, CustomerInvoice.InvoiceStatus.PARTIAL)
        self.assertEqual(inv2.amount_paid, Decimal('25.00'))
