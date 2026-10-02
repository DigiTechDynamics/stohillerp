"""
Stohil Properties - Properties Module Models
Core property management: listings, units, valuations, inspections.
Properties are the central entity linking all other modules.
"""

import builtins
import uuid
from decimal import Decimal

from django.db import models  # type: ignore
from apps.core.models import AuditedModel, TimeStampedModel  # type: ignore


class PropertyType(TimeStampedModel):
    """Configurable property types (e.g., Residential, Commercial, Industrial)."""
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        db_table = 'properties_types'

    def __str__(self):
        return self.name


class Property(AuditedModel):
    """
    Master Property record. Represents a physical asset owned or managed by Stohill.
    Can contain multiple units (apartments, offices, etc.).
    Links to Finance module for asset accounting.
    """

    class PropertyStatus(models.TextChoices):
        AVAILABLE = 'available', 'Available'
        OCCUPIED = 'occupied', 'Occupied'
        UNDER_CONTRACT = 'under_contract', 'Under Contract'
        MAINTENANCE = 'maintenance', 'Under Maintenance'
        LISTED_FOR_SALE = 'listed_sale', 'Listed for Sale'
        LISTED_FOR_RENT = 'listed_rent', 'Listed for Rent'
        SOLD = 'sold', 'Sold'
        INACTIVE = 'inactive', 'Inactive'

    class OwnershipType(models.TextChoices):
        OWNED = 'owned', 'Company Owned'
        MANAGED = 'managed', 'Managed (Third Party)'
        JOINT_VENTURE = 'jv', 'Joint Venture'

    # Identity
    reference_number = models.CharField(max_length=50, unique=True, blank=True)
    name = models.CharField(max_length=200)
    property_type = models.ForeignKey(PropertyType, on_delete=models.PROTECT, related_name='properties')
    ownership_type = models.CharField(max_length=20, choices=OwnershipType.choices, default=OwnershipType.OWNED)
    status = models.CharField(max_length=30, choices=PropertyStatus.choices, default=PropertyStatus.AVAILABLE)
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='properties', null=True)

    # Location
    address_line1 = models.CharField(max_length=255)
    address_line2 = models.CharField(max_length=255, blank=True)
    suburb = models.CharField(max_length=100, blank=True)
    city = models.CharField(max_length=100, blank=True)
    province = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=10, blank=True)
    country = models.CharField(max_length=50, default='South Africa')
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)

    # Physical attributes
    erf_size = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text='Erf size in m²')
    floor_size = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text='Floor area in m²')
    bedrooms = models.PositiveSmallIntegerField(null=True, blank=True)
    bathrooms = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    garages = models.PositiveSmallIntegerField(default=0)
    parking_bays = models.PositiveSmallIntegerField(default=0)
    year_built = models.PositiveSmallIntegerField(null=True, blank=True)

    # Valuation
    purchase_price = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    purchase_date = models.DateField(null=True, blank=True)
    current_valuation = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    last_valuation_date = models.DateField(null=True, blank=True)
    asking_price = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    rental_rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text='Monthly rental rate')

    # Utilities and Rates
    rates_monthly = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    levies_monthly = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    bond_amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    bond_institution = models.CharField(max_length=100, blank=True)
    bond_monthly_payment = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    # Finance linkage (GL account for this property's income/expenses)
    gl_account_code = models.CharField(max_length=20, blank=True, help_text='Chart of accounts reference')

    # Managed (third-party) properties: rent collected belongs to the owner
    # (held in trust) less the agency's management fee.
    owner = models.ForeignKey('crm.Contact', null=True, blank=True, on_delete=models.PROTECT,
                              related_name='owned_properties', help_text='Landlord, for managed properties')
    management_fee_rate = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('10.00'),
                                              help_text='% of rent retained as management fee (managed properties)')
    # One-off agency fees charged to the owner (managed properties).
    letting_fee_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'),
                                              help_text="% of the first month's rent, charged when a new lease starts")
    procurement_fee_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0.00'),
                                                  help_text='% of maintenance cost charged for arranging the work')

    @property
    def is_managed(self):
        return self.ownership_type == self.OwnershipType.MANAGED and self.owner_id is not None

    # Rich description
    description = models.TextField(blank=True)
    features = models.JSONField(default=list, blank=True, help_text='List of feature strings')
    notes = models.TextField(blank=True)
    # Values for user-defined fields (CustomFieldDefinition, entity "property").
    custom_fields = models.JSONField(default=dict, blank=True)
    # Optional grouping for reporting (fund, portfolio, region...).
    portfolio = models.ForeignKey('properties.Portfolio', null=True, blank=True, on_delete=models.SET_NULL,
                                  related_name='properties')

    # Assigned agent
    primary_agent = models.ForeignKey(
        'hr.Employee',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='primary_properties'
    )

    class Meta:
        db_table = 'properties'
        ordering = ['reference_number']
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['city', 'suburb']),
            models.Index(fields=['property_type']),
        ]

    def __str__(self):
        return f'{self.reference_number} - {self.name}'

    def save(self, *args, **kwargs):
        if not self.reference_number:
            from apps.core.services.number_sequence import NumberSequenceService  # type: ignore
            self.reference_number = NumberSequenceService.get_next_number("Property Reference", prefix="PROP-", padding=4)
        super().save(*args, **kwargs)

    @property
    def full_address(self):
        parts = [self.address_line1, self.address_line2, self.suburb, self.city, self.postal_code]
        return ', '.join(p for p in parts if p)


class PropertyUnit(AuditedModel):
    """
    Sub-unit within a property (e.g., Apartment 3B in a complex).
    Used for sectional title, blocks of flats, commercial parks.
    """

    class UnitStatus(models.TextChoices):
        AVAILABLE = 'available', 'Available'
        OCCUPIED = 'occupied', 'Occupied'
        UNDER_MAINTENANCE = 'maintenance', 'Under Maintenance'
        RESERVED = 'reserved', 'Reserved'

    class UnitType(models.TextChoices):
        RESIDENTIAL = 'residential', 'Residential'
        OFFICE = 'office', 'Office'
        RETAIL = 'retail', 'Retail / Shop'
        INDUSTRIAL = 'industrial', 'Industrial / Warehouse'
        PARKING = 'parking', 'Parking'
        STORAGE = 'storage', 'Storage'
        OTHER = 'other', 'Other'

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='units')
    unit_number = models.CharField(max_length=50)
    unit_type = models.CharField(max_length=20, choices=UnitType.choices, default=UnitType.RESIDENTIAL)
    floor = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=UnitStatus.choices, default=UnitStatus.AVAILABLE)
    # Gross lettable area (m²): the basis for area-apportioned recoveries.
    floor_size = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                     help_text='Gross lettable area (m²)')
    bedrooms = models.PositiveSmallIntegerField(null=True, blank=True)
    bathrooms = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    monthly_rental = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True,
                                         help_text='Asking (market) rent')
    notes = models.TextField(blank=True)
    custom_fields = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = 'properties_units'
        unique_together = ['property', 'unit_number']

    def __str__(self):
        return f'{self.property.reference_number} - Unit {self.unit_number}'


class PropertyImage(TimeStampedModel):
    """Property images/photos with ordering and categorization."""

    class ImageCategory(models.TextChoices):
        EXTERIOR = 'exterior', 'Exterior'
        INTERIOR = 'interior', 'Interior'
        FLOOR_PLAN = 'floor_plan', 'Floor Plan'
        AERIAL = 'aerial', 'Aerial'
        OTHER = 'other', 'Other'

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='properties/images/%Y/%m/')
    caption = models.CharField(max_length=255, blank=True)
    category = models.CharField(max_length=20, choices=ImageCategory.choices, default=ImageCategory.INTERIOR)
    is_primary = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'properties_images'
        ordering = ['sort_order', 'created_at']


class PropertyValuation(AuditedModel):
    """
    Historical valuation records for a property.
    Used for financial reporting and asset tracking.
    """
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='valuations')
    valuation_date = models.DateField()
    valuation_amount = models.DecimalField(max_digits=15, decimal_places=2)
    valuator_name = models.CharField(max_length=200)
    valuator_company = models.CharField(max_length=200, blank=True)
    method = models.CharField(max_length=100, blank=True, help_text='Valuation method used')
    report_reference = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'properties_valuations'
        ordering = ['-valuation_date']


class PropertyInspection(AuditedModel):
    """Scheduled and completed property inspections."""

    class InspectionType(models.TextChoices):
        INGOING = 'ingoing', 'Ingoing Inspection'
        OUTGOING = 'outgoing', 'Outgoing Inspection'
        ROUTINE = 'routine', 'Routine Inspection'
        MAINTENANCE = 'maintenance', 'Maintenance Inspection'

    class InspectionStatus(models.TextChoices):
        SCHEDULED = 'scheduled', 'Scheduled'
        IN_PROGRESS = 'in_progress', 'In Progress'
        COMPLETED = 'completed', 'Completed'
        CANCELLED = 'cancelled', 'Cancelled'

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='inspections')
    unit = models.ForeignKey(PropertyUnit, null=True, blank=True, on_delete=models.SET_NULL)
    inspection_type = models.CharField(max_length=20, choices=InspectionType.choices)
    status = models.CharField(max_length=20, choices=InspectionStatus.choices, default=InspectionStatus.SCHEDULED)
    scheduled_date = models.DateTimeField()
    completed_date = models.DateTimeField(null=True, blank=True)
    inspector = models.ForeignKey('hr.Employee', on_delete=models.SET_NULL, null=True)
    condition_rating = models.PositiveSmallIntegerField(null=True, blank=True, help_text='1-10 rating')
    findings = models.TextField(blank=True)
    action_required = models.TextField(blank=True)
    report_document = models.FileField(upload_to='inspections/%Y/%m/', null=True, blank=True)
    lease = models.ForeignKey('rentals.Lease', null=True, blank=True, on_delete=models.SET_NULL,
                              related_name='inspections')

    class Meta:
        db_table = 'properties_inspections'
        ordering = ['-scheduled_date']

    @builtins.property      # property is a field name in this class
    def damage_total(self):
        return sum((i.repair_cost for i in self.items.all()), Decimal('0.00'))


class InspectionItem(models.Model):
    """One checklist line of an inspection: an item in an area and its condition."""

    class Condition(models.TextChoices):
        GOOD = 'good', 'Good'
        FAIR = 'fair', 'Fair'
        POOR = 'poor', 'Poor'
        DAMAGED = 'damaged', 'Damaged'
        MISSING = 'missing', 'Missing'
        NOT_APPLICABLE = 'na', 'Not applicable'

    inspection = models.ForeignKey(PropertyInspection, on_delete=models.CASCADE, related_name='items')
    area = models.CharField(max_length=100, help_text='e.g. Kitchen, Bedroom 1')
    item = models.CharField(max_length=150, help_text='e.g. Walls, Stove, Windows')
    condition = models.CharField(max_length=10, choices=Condition.choices, default=Condition.GOOD)
    notes = models.TextField(blank=True)
    photo = models.ImageField(upload_to='inspections/photos/%Y/%m/', null=True, blank=True)
    # Estimated cost to repair damage the tenant is liable for (outgoing inspections).
    repair_cost = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'properties_inspection_items'
        ordering = ['sort_order', 'id']


class Portfolio(TimeStampedModel):
    """A grouping of properties (fund, portfolio, region) for reporting."""
    name = models.CharField(max_length=150, unique=True)
    description = models.TextField(blank=True)

    class Meta:
        db_table = 'properties_portfolios'
        ordering = ['name']

    def __str__(self):
        return self.name


class PropertyOwnership(TimeStampedModel):
    """
    A share of a managed property held by one owner. When a property has
    ownership shares, owner funds, statements and payouts are split by them;
    otherwise the property's single `owner` holds 100%.
    """
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='ownerships')
    owner = models.ForeignKey('crm.Contact', on_delete=models.PROTECT, related_name='property_shares')
    share_percent = models.DecimalField(max_digits=6, decimal_places=3)

    class Meta:
        db_table = 'properties_ownerships'
        unique_together = ['property', 'owner']

    def __str__(self):
        return f'{self.owner} {self.share_percent}% of {self.property}'


class CustomFieldDefinition(TimeStampedModel):
    """A user-defined field shown on properties, units, leases or contacts."""

    class Entity(models.TextChoices):
        PROPERTY = 'property', 'Property'
        UNIT = 'unit', 'Unit'
        LEASE = 'lease', 'Lease'
        CONTACT = 'contact', 'Contact'

    class FieldType(models.TextChoices):
        TEXT = 'text', 'Text'
        NUMBER = 'number', 'Number'
        DATE = 'date', 'Date'
        BOOLEAN = 'boolean', 'Yes / No'
        CHOICE = 'choice', 'Choice'

    entity = models.CharField(max_length=20, choices=Entity.choices)
    key = models.SlugField(max_length=60, help_text='Stored name, e.g. "erf_number"')
    label = models.CharField(max_length=100)
    field_type = models.CharField(max_length=10, choices=FieldType.choices, default=FieldType.TEXT)
    choices = models.JSONField(default=list, blank=True, help_text='Options for a choice field')
    required = models.BooleanField(default=False)
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'properties_custom_fields'
        unique_together = ['entity', 'key']
        ordering = ['entity', 'sort_order', 'label']

    def __str__(self):
        return f'{self.get_entity_display()}: {self.label}'
