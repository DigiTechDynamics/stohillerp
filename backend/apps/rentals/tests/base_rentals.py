from decimal import Decimal
from datetime import date, timedelta
from apps.finance.tests.base_finance import FinanceBaseTestCase
from apps.rentals.models import Lease, RentalInvoice, OwnerSettlement
from apps.properties.models import Property, PropertyUnit
from apps.crm.models import Contact

class RentalsBaseTestCase(FinanceBaseTestCase):
    """
    Base test case for Rentals module. Inherits from FinanceBaseTestCase 
    to obtain a pre-configured Chart of Accounts and Fiscal Periods.
    """

    def setUp(self):
        super().setUp()
        
        # Setup additional GL Accounts missing from FinanceBaseTestCase
        from apps.finance.models import ChartOfAccount
        for code, name, sub_type in [
            ('5300', 'Maintenance', 'operating_expense'),
            ('5400', 'Rates and Levies', 'operating_expense'),
            ('5500', 'Insurance', 'operating_expense'),
        ]:
            ChartOfAccount.objects.get_or_create(
                code=code,
                defaults={
                    'name': name,
                    'account_type': 'expense',
                    'account_sub_type': sub_type,
                    'is_active': True,
                    'allow_direct_posting': True,
                    'allow_manual_entry': True
                }
            )
        
        # 1. Create a Property Owner (Contact)
        self.owner = Contact.objects.create(
            first_name="Oliver",
            last_name="Owner",
            email="oliver@properties.com",
            contact_type=Contact.ContactType.LANDLORD
        )

        # 1.5 Create a Property Type
        from apps.properties.models import PropertyType
        self.prop_type = PropertyType.objects.create(
            name="Commercial",
            code="COMMERCIAL"
        )

        # 2. Create a Managed Property
        self.property = Property.objects.create(
            name="Stohill Plaza",
            reference_number="PROP-SP01",
            property_type=self.prop_type,
            owner=self.owner,
            currency=self.usd,
            # Setup expense amounts for settlement testing
            rates_monthly=Decimal('50.00'),
            levies_monthly=Decimal('30.00'),
            insurance_monthly=Decimal('20.00')
        )

        # 3. Create a Unit within the property
        self.unit = PropertyUnit.objects.create(
            property=self.property,
            unit_number="Suite 101",
            floor=0,
            floor_size=Decimal('100.00'),
            monthly_rental=Decimal('1000.00'),
            status=PropertyUnit.UnitStatus.AVAILABLE
        )

        # 4. Create a Tenant (Contact)
        self.tenant = Contact.objects.create(
            first_name="Terry",
            last_name="Tenant",
            email="terry@test.com",
            contact_type=Contact.ContactType.TENANT
        )

    def create_lease(self, start_date=None, rental=Decimal('1000.00'), status=Lease.LeaseStatus.DRAFT):
        """Helper to quickly create a lease for testing."""
        if start_date is None:
            start_date = date.today()
            
        return Lease.objects.create(
            lease_number=f"LSE-{self.unit.unit_number}-{start_date.strftime('%y%m')}",
            property=self.property,
            unit=self.unit,
            tenant=self.tenant,
            start_date=start_date,
            end_date=start_date + timedelta(days=365),
            monthly_rental=rental,
            currency=self.usd,
            status=status,
            management_fee_rate=Decimal('10.00'),
            rental_escalation_rate=Decimal('10.00'),
            vat_applicable=True,
            next_invoice_date=start_date # Normally defaulted to start_date or 1st of month
        )
