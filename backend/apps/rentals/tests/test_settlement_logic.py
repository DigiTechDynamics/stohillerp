from decimal import Decimal
from datetime import date
from django.db.models import Sum
from apps.rentals.models import Lease, RentalInvoice, RentalPayment, MaintenanceRequest, OwnerSettlement
from apps.rentals.services.settlement_service import OwnerSettlementService
from apps.rentals.tests.base_rentals import RentalsBaseTestCase

class SettlementLogicTests(RentalsBaseTestCase):
    """
    Test Owner Settlement calculations (Cash Basis) and financial impact.
    """

    def setUp(self):
        super().setUp()
        self.settlement_service = OwnerSettlementService()

    def test_settlement_calculation_accuracy(self):
        """Verify the 'Cash Basis' formula: Net Payout = Collected - (Fee+VAT) - Expenses."""
        # 1. Setup Active Lease for April
        lease = self.create_lease(start_date=date(2026, 4, 1), status=Lease.LeaseStatus.ACTIVE)
        inv = RentalInvoice.objects.create(
            lease=lease,
            period_start=date(2026, 4, 1),
            period_end=date(2026, 4, 30),
            due_date=date(2026, 4, 5),
            rental_amount=Decimal('1000.00'),
            vat_amount=Decimal('150.00'),
            total_amount=Decimal('1150.00'),
            balance_due=Decimal('1150.00'),
            status=RentalInvoice.InvoiceStatus.SENT
        )

        # 2. Receive Payment (Partial: 1000)
        payment = RentalPayment.objects.create(
            invoice=inv,
            amount=Decimal('1000.00'),
            payment_date=date(2026, 4, 15),
            reference="PAY-1",
            payment_method=RentalPayment.PaymentMethod.EFT
        )

        # 3. Setup Property Expenses (100 in total from base setup + 50 Maintenance)
        MaintenanceRequest.objects.create(
            property=self.property,
            category="Plumbing",
            description="Leaking Tap",
            actual_cost=Decimal('50.00'),
            status=MaintenanceRequest.Status.COMPLETED,
            completed_date=date(2026, 4, 20),
            billed_to_tenant=False
        )

        # 4. Generate Settlement for April
        results = self.settlement_service.generate_monthly_settlements(month=4, year=2026)
        
        self.assertEqual(results['settlements_created'], 1)
        
        # 5. Verify Amounts
        settlement = OwnerSettlement.objects.filter(property=self.property, period_start=date(2026, 4, 1)).first()
        self.assertIsNotNone(settlement)
        
        # Collected = 1000.00
        # Management Fee (10% of 1000) = 100.00
        # VAT on Fee (15% of 100) = 15.00
        # Total Fees = 115.00
        # Expenses (Rates 50 + Levies 30 + Insur 20 + Maint 50) = 150.00
        # Total Deductions = 115 + 150 = 265.00
        # Net Payout = 1000 - 265 = 735.00
        
        self.assertEqual(settlement.total_rent_collected, Decimal('1000.00'))
        self.assertEqual(settlement.management_fee_amount, Decimal('115.00'))
        self.assertEqual(settlement.expenses_deducted, Decimal('150.00'))
        self.assertEqual(settlement.net_payout_amount, Decimal('735.00'))
        self.assertEqual(settlement.status, OwnerSettlement.SettlementStatus.DRAFT)

    def test_settlement_gl_ledger_post(self):
        """Verify that processing a settlement triggers accurate multi-account GL postings."""
        # 1. Setup Draft Settlement
        settlement = OwnerSettlement.objects.create(
            owner=self.owner,
            property=self.property,
            period_start=date(2026, 4, 1),
            period_end=date(2026, 4, 30),
            currency=self.usd,
            total_rent_collected=Decimal('1000.00'),
            management_fee_amount=Decimal('115.00'),
            expenses_deducted=Decimal('150.00'), # (Rates/Levies 80, Insurance 20, Maint 50)
            net_payout_amount=Decimal('735.00'),
            status=OwnerSettlement.SettlementStatus.DRAFT
        )

        # 2. Process & Post
        entry = self.settlement_service.process_and_post_settlement(settlement)
        
        # Verify Post
        self.assertIsNotNone(entry)
        self.assertEqual(settlement.status, OwnerSettlement.SettlementStatus.PAID)
        
        # Verify Key Lines
        # Debit Revenue (Whole Rent portion) - 1000.00
        # Credit Management Fee Revenue - 100.00
        # Credit VAT - 15.00
        # Credit AP (Owner) - 735.00
        # Credit Expense reimbursements: Rates 80, Insur 20, Maint 50

        net_fee_line = entry.lines.filter(account__code='4300').first()
        self.assertEqual(net_fee_line.amount, Decimal('100.00'))
        
        owner_ap_line = entry.lines.filter(account__code='2000').first()
        self.assertEqual(owner_ap_line.amount, Decimal('735.00'))
