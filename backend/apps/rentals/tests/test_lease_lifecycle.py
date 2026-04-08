from decimal import Decimal
from datetime import date, timedelta
from apps.rentals.models import Lease
from apps.properties.models import PropertyUnit
from apps.rentals.tests.base_rentals import RentalsBaseTestCase

class LeaseLifecycleTests(RentalsBaseTestCase):
    """
    Test Lease activation, date calculations, and unit occupancy integrity.
    """

    def test_lease_activation_updates_unit(self):
        """Verify that activating a lease changes the unit status to OCCUPIED."""
        lease = self.create_lease(status=Lease.LeaseStatus.DRAFT)
        self.assertEqual(self.unit.status, PropertyUnit.UnitStatus.AVAILABLE)

        # Activate Lease
        lease.activate()
        
        # Refresh unit from DB
        self.unit.refresh_from_db()
        self.assertEqual(self.unit.status, PropertyUnit.UnitStatus.OCCUPIED)

    def test_overlapping_active_leases_prevented(self):
        """Verify that two ACTIVE leases cannot exist for the same unit simultaneously."""
        # 1. Create and Activate first lease
        l1 = self.create_lease(start_date=date(2026, 1, 1), status=Lease.LeaseStatus.ACTIVE)
        
        # 2. Try to activate second lease for same unit
        l2 = self.create_lease(start_date=date(2026, 2, 1), status=Lease.LeaseStatus.DRAFT)
        
        with self.assertRaises(ValueError) as cm:
            l2.status = Lease.LeaseStatus.ACTIVE
            l2.save() # Expecting validation error in save() or clean()
            
        self.assertIn("already has an active lease", str(cm.exception).lower())

    def test_calculate_next_invoice_date(self):
        """Verify that Lease correctly calculates the subsequent billing date."""
        # Standard Monthly
        lease = self.create_lease(start_date=date(2026, 1, 1))
        
        # After Jan 1st, next should be Feb 1st
        next_date = lease.calculate_next_invoice_date(after_date=date(2026, 1, 1))
        self.assertEqual(next_date, date(2026, 2, 1))
        
        # Test Year-end wrap around
        next_date = lease.calculate_next_invoice_date(after_date=date(2026, 12, 1))
        self.assertEqual(next_date, date(2027, 1, 1))
