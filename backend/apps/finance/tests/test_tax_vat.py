import os
from decimal import Decimal
from datetime import date
from django.test import TestCase
from apps.finance.services.accounting import AccountingService, PostingData, AccountingError
from apps.finance.models import TaxTransaction, CustomerInvoice, CustomerInvoiceLine, JournalEntry
from apps.finance.tests.base_finance import FinanceBaseTestCase

class TaxVATTests(FinanceBaseTestCase):
    """
    Test Tax and VAT accounting: input/output VAT and TaxTransactions.
    """

    def setUp(self):
        super().setUp()
        self.service = AccountingService(user=None)
        
        # Mock customer
        self.customer, _ = type('obj', (object,), {
            'name': 'Taxable Customer',
            'id': 303,
            'contact_link': None
        }), True

    def test_vat_tax_transaction_generation_output(self):
        """Verify that posting a customer invoice creates automated TaxTransaction records."""
        # Gross: 115.00, Net: 100.00, VAT: 15.00
        invoice = CustomerInvoice.objects.create(
            customer_id=1, # Mocking ID for simplicity if needed or use real from AR setup
            invoice_number="VAT-OUT-101",
            invoice_date=date.today(),
            total_amount=Decimal('115.00'),
            subtotal=Decimal('100.00'),
            currency=self.usd
        )
        # Re-using the customer from setUp (id=1 since it's first)
        invoice.customer_id = self.customer.id if hasattr(self.customer, 'id') else 1

        CustomerInvoiceLine.objects.create(
            invoice=invoice,
            description="Laptops",
            revenue_account=self.accounts['4100'],
            unit_price=Decimal('100.00'),
            tax_code=self.tax_vat,
            tax_amount=Decimal('15.00'),
            line_total=Decimal('115.00')
        )

        # Post
        self.service.post_customer_invoice(invoice)
        
        # Verify TaxTransaction
        tax_trans = TaxTransaction.objects.filter(reference=invoice.invoice_number).first()
        self.assertIsNotNone(tax_trans)
        self.assertEqual(tax_trans.tax_amount, Decimal('15.00'))
        self.assertEqual(tax_trans.transaction_type, TaxTransaction.TransactionType.OUTPUT)
        self.assertEqual(tax_trans.tax_code, self.tax_vat)

    def test_input_vat_ledger_accuracy(self):
        """Verify that input VAT (purchases) correctly debits the VAT Receivable account."""
        # Net: 200, VAT: 30, Total: 230
        data = PostingData(description="Input VAT Purchase", entry_date=date.today(), source_module='ap')
        data.add_debit(self.accounts['5000'].code, Decimal('200.00'), "Net Expense")
        data.add_debit(self.accounts['2110'].code, Decimal('30.00'), "Input VAT Debit")
        data.add_credit(self.accounts['2000'].code, Decimal('230.00'), "Total AP")

        # Post
        self.service.post_entry(data)
        
        # Verify Asset (Debit 2110)
        self.accounts['2110'].refresh_from_db()
        self.assertEqual(self.accounts['2110'].current_balance, Decimal('30.00'))

    def test_output_vat_ledger_accuracy(self):
        """Verify that output VAT (sales) correctly credits the VAT Payable account."""
        # Net: 400, VAT: 60, Total: 460
        data = PostingData(description="Output VAT Sale", entry_date=date.today(), source_module='ar')
        data.add_debit(self.accounts['1100'].code, Decimal('460.00'), "Total AR")
        data.add_credit(self.accounts['4100'].code, Decimal('400.00'), "Net Revenue")
        data.add_credit(self.accounts['2100'].code, Decimal('60.00'), "Output VAT Credit")

        # Post
        self.service.post_entry(data)
        
        # Verify Liability (Credit 2100)
        self.accounts['2100'].refresh_from_db()
        self.assertEqual(self.accounts['2100'].current_balance, Decimal('60.00'))
