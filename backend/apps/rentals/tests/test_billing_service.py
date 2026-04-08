from decimal import Decimal
from datetime import date, timedelta
from apps.rentals.models import Lease, RentalInvoice
from apps.rentals.services.billing import LeaseBillingService
from apps.rentals.tests.base_rentals import RentalsBaseTestCase

class BillingServiceTests(RentalsBaseTestCase):
    """
    Test bulk invoice generation, late fee application, and rent escalations.
    """

    def setUp(self):
        super().setUp()
        self.billing = LeaseBillingService()

    def test_monthly_invoice_generation_accuracy(self):
        """Verify that generate_monthly_invoices creates correct RentalInvoice records."""
        # 1. Setup Active Lease due today
        lease = self.create_lease(start_date=date(2026, 3, 1), status=Lease.LeaseStatus.ACTIVE)
        lease.next_invoice_date = date(2026, 4, 1)
        lease.save()

        # 2. Run Generation for April
        results = self.billing.generate_monthly_invoices(target_date=date(2026, 4, 1))
        
        self.assertEqual(results['processed'], 1)
        
        # 3. Verify Invoice
        invoice = RentalInvoice.objects.filter(lease=lease, period_start=date(2026, 4, 1)).first()
        self.assertIsNotNone(invoice)
        self.assertEqual(invoice.rental_amount, Decimal('1000.00'))
        self.assertEqual(invoice.vat_amount, Decimal('150.00')) # 15%
        self.assertEqual(invoice.total_amount, Decimal('1150.00'))
        
        # 4. Verify Lease Advanced
        lease.refresh_from_db()
        self.assertEqual(lease.next_invoice_date, date(2026, 5, 1))

    def test_late_fee_application_after_grace(self):
        """Verify that $100 penalty is only applied after the 5-day grace period."""
        # 1. Setup SENT Invoice due April 5th
        lease = self.create_lease(status=Lease.LeaseStatus.ACTIVE)
        inv = RentalInvoice.objects.create(
            lease=lease,
            period_start=date(2026, 3, 1),
            period_end=date(2026, 3, 31),
            due_date=date(2026, 4, 5),
            rental_amount=Decimal('1000.00'),
            total_amount=Decimal('1150.00'),
            balance_due=Decimal('1150.00'),
            status=RentalInvoice.InvoiceStatus.SENT
        )

        # 2. Try processing at April 8th (within grace)
        self.billing.apply_late_fees(target_date=date(2026, 4, 8))
        inv.refresh_from_db()
        self.assertEqual(inv.late_payment_fee, Decimal('0.00'))

        # 3. Try processing at April 11th (past 5-day grace: 5 + 5 = 10th)
        self.billing.apply_late_fees(target_date=date(2026, 4, 11))
        inv.refresh_from_db()
        self.assertEqual(inv.late_payment_fee, Decimal('100.00'))
        self.assertEqual(inv.total_amount, Decimal('1250.00'))
        self.assertEqual(inv.status, RentalInvoice.InvoiceStatus.OVERDUE)

    def test_annual_rent_escalation(self):
        """Verify that rent increases by 10% exactly 12 months after start_date."""
        # 1. Setup Lease that started 1 year ago
        started_at = date(2025, 4, 1)
        lease = self.create_lease(start_date=started_at, rental=Decimal('1000.00'), status=Lease.LeaseStatus.ACTIVE)
        lease.rental_escalation_rate = Decimal('10.00')
        lease.save()

        # 2. Process escalations at Apr 1st 2026
        results = self.billing.process_escalations(target_date=date(2026, 4, 1))
        
        self.assertEqual(results['escalations_applied'], 1)
        
        # 3. Verify new rental
        lease.refresh_from_db()
        self.assertEqual(lease.monthly_rental, Decimal('1100.00')) # 1000 + 10%
        self.assertEqual(lease.last_escalation_date, date(2026, 4, 1))
