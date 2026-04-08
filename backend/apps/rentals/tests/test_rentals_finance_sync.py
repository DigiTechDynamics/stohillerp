from decimal import Decimal
from datetime import date
from apps.rentals.models import Lease, RentalInvoice
from apps.rentals.services.finance_sync import RentalFinanceSyncService
from apps.finance.models import CustomerInvoice, JournalEntry
from apps.rentals.tests.base_rentals import RentalsBaseTestCase

class RentalsFinanceSyncTests(RentalsBaseTestCase):
    """
    Test the synchronization bridge between Rentals and Finance (GL).
    """

    def setUp(self):
        super().setUp()
        self.sync_service = RentalFinanceSyncService()

    def test_rental_invoice_to_ar_sync(self):
        """Verify that a RentalInvoice correctly creates/updates a CustomerInvoice and JournalEntry."""
        # 1. Create Lease & RentalInvoice
        lease = self.create_lease(status=Lease.LeaseStatus.ACTIVE)
        rent_inv = RentalInvoice.objects.create(
            lease=lease,
            period_start=date(2026, 4, 1),
            period_end=date(2026, 4, 30),
            due_date=date.today(),
            rental_amount=Decimal('1000.00'),
            vat_amount=Decimal('150.00'),
            total_amount=Decimal('1150.00'),
            balance_due=Decimal('1150.00'),
            status=RentalInvoice.InvoiceStatus.SENT
        )

        # 2. Trigger Sync
        self.sync_service.sync_rental_invoice_to_ar(rent_inv)
        
        # 3. Verify CustomerInvoice (Finance)
        cust_inv = CustomerInvoice.objects.filter(invoice_number=f"AR-{rent_inv.invoice_number}").first()
        self.assertIsNotNone(cust_inv)
        self.assertEqual(cust_inv.total_amount, Decimal('1150.00'))
        
        # 4. Verify JournalEntry (Finance GL)
        je = cust_inv.journal_entry
        self.assertIsNotNone(je)
        self.assertEqual(je.status, JournalEntry.EntryStatus.POSTED)
        
        # Asset DEBIT: AR (1100) - 1150.00
        # Revenue CREDIT: Rental Income (4100) - 1000.00
        # Liability CREDIT: VAT (2100) - 150.00
        
        ar_line = je.lines.filter(account__code='1100').first()
        self.assertEqual(ar_line.amount, Decimal('1150.00'))
        self.assertEqual(ar_line.side, 'debit')
        
        rev_line = je.lines.filter(account__code='4100').first()
        self.assertEqual(rev_line.amount, Decimal('1000.00'))
        self.assertEqual(rev_line.side, 'credit')
