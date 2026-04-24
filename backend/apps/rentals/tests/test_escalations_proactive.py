from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from apps.rentals.models import Lease
from apps.rentals.services.escalation import LeaseEscalationService
from apps.notifications.models import Notification
from apps.core.models import AuditLog, User, Currency
from apps.properties.models import Property, PropertyUnit, PropertyType
from apps.crm.models import Contact

class ProactiveEscalationTestCase(TestCase):
    def setUp(self):
        # Create base data
        self.currency = Currency.objects.create(code='USD', name='US Dollar')
        self.property_type = PropertyType.objects.create(name='Commercial', code='COMM')
        self.property = Property.objects.create(
            name='Test Plaza', 
            address_line1='123 Test St',
            property_type=self.property_type
        )
        self.unit = PropertyUnit.objects.create(property=self.property, unit_number='101', status='vacant', floor=1)
        self.tenant = Contact.objects.create(first_name='John', last_name='Doe', email='john@example.com')
        self.admin = User.objects.create_superuser(email='admin@stohill.co.za', password='admin123!', first_name='Admin', last_name='User')

        # Create a lease that started exactly 10 months ago (so anniversary is in 2 months / 60 days)
        # Target Date: 2026-04-24
        # Notice Date: 2026-06-23 (60 days from now)
        # Start Date: 2025-06-23
        self.target_date = date(2026, 4, 24)
        self.start_date = date(2025, 6, 23)
        
        self.lease = Lease.objects.create(
            lease_number='LSE-TEST-001',
            property=self.property,
            unit=self.unit,
            tenant=self.tenant,
            currency=self.currency,
            status=Lease.LeaseStatus.ACTIVE,
            start_date=self.start_date,
            monthly_rental=Decimal('1000.00'),
            rental_escalation_rate=Decimal('8.00'),
            invoice_day=1
        )

    def test_find_upcoming_escalations(self):
        """Verify that the service finds the lease 60 days before its anniversary."""
        upcoming = LeaseEscalationService.find_upcoming_escalations(days_advance=60, target_date=self.target_date)
        self.assertEqual(len(upcoming), 1)
        self.assertEqual(upcoming[0].id, self.lease.id)

    def test_process_escalation_notices(self):
        """Verify that notices are generated, logged, and notifications created."""
        results = LeaseEscalationService.process_escalation_notices(days_advance=60, target_date=self.target_date)
        
        self.assertEqual(results['notices_sent'], 1)
        
        # Check Audit Log
        audit = AuditLog.objects.filter(model_name='Lease', object_id=str(self.lease.id)).first()
        self.assertIsNotNone(audit)
        self.assertIn('projected_new_rental', audit.changes)
        self.assertEqual(audit.changes['projected_new_rental'], '1080.00')
        self.assertEqual(audit.changes['effective_date'], '2026-06-23')

        # Check Notification
        notif = Notification.objects.filter(recipient=self.admin).first()
        self.assertIsNotNone(notif)
        self.assertIn('LSE-TEST-001', notif.description)
        self.assertIn('2026-06-23', notif.description)
