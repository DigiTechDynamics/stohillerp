"""
Stohil Properties - Properties Module Models
Core property management: listings, units, valuations, inspections.
Properties are the central entity linking all other modules.
"""

import uuid
from decimal import Decimal
from django.db import models  # type: ignore
from django.core.validators import MinValueValidator
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
    # Ownership
    owner = models.ForeignKey(
        'crm.Contact', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='owned_properties',
        help_text="The third-party owner of the property (for managed units)."
    )
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
    country = models.CharField(max_length=50, default='Zimbabwe')
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

    # Added attributes for Website Integration
    lounges = models.PositiveSmallIntegerField(default=0)
    boreholes = models.PositiveSmallIntegerField(default=0)
    pool = models.PositiveSmallIntegerField(default=0)
    parking_spaces = models.PositiveSmallIntegerField(default=0)
    storeys = models.PositiveSmallIntegerField(default=1)
    dining_rooms = models.PositiveSmallIntegerField(default=0)
    carports = models.PositiveSmallIntegerField(default=0)

    # Feature Flags
    entertainment_area = models.BooleanField(default=False)
    cottage = models.BooleanField(default=False)
    fitted_kitchen = models.BooleanField(default=False)
    tiled = models.BooleanField(default=False)
    built_in_cupboards = models.BooleanField(default=False)
    mes = models.BooleanField(default=False)
    walled_fenced = models.BooleanField(default=False)
    landscaped_garden = models.BooleanField(default=False)

    # Cottage Details
    cottage_beds = models.PositiveSmallIntegerField(default=0)
    cottage_bathrooms = models.PositiveSmallIntegerField(default=0)
    cottage_dining = models.PositiveSmallIntegerField(default=0)
    cottage_parking = models.PositiveSmallIntegerField(default=0)

    # SEO and External Sync
    slug = models.SlugField(max_length=255, unique=True, null=True, blank=True)
    external_id = models.UUIDField(null=True, blank=True, unique=True, help_text='Original ID from website/Supabase')

    class WebsiteCategory(models.TextChoices):
        FOR_SALE = 'for-sale', 'For Sale'
        FOR_RENT = 'for-rent', 'For Rent'
        AUCTIONS = 'auctions', 'Auctions'

    website_category = models.CharField(
        max_length=20,
        choices=WebsiteCategory.choices,
        null=True,
        blank=True
    )

    # Valuation
    purchase_price = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    purchase_date = models.DateField(null=True, blank=True)
    current_valuation = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    last_valuation_date = models.DateField(null=True, blank=True)
    asking_price = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    rental_rate = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, help_text='Monthly rental rate', validators=[MinValueValidator(0)])

    # Utilities and Rates
    rates_monthly = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    levies_monthly = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    insurance_monthly = models.DecimalField(max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(0)])
    bond_amount = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])
    bond_institution = models.CharField(max_length=100, blank=True)
    bond_monthly_payment = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(0)])

    # Finance linkage (GL account for this property's income/expenses)
    gl_account_code = models.CharField(max_length=20, blank=True, help_text='Chart of accounts reference')

    # Rich description
    description = models.TextField(blank=True)
    features = models.JSONField(default=list, blank=True, help_text='List of feature strings')
    notes = models.TextField(blank=True)

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
            models.Index(fields=['slug']),
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

    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='units')
    unit_number = models.CharField(max_length=50)
    floor = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=UnitStatus.choices, default=UnitStatus.AVAILABLE)
    floor_size = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    bedrooms = models.PositiveSmallIntegerField(null=True, blank=True)
    bathrooms = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    monthly_rental = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    notes = models.TextField(blank=True)

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

    reference = models.CharField(max_length=50, unique=True, null=True, blank=True)
    property = models.ForeignKey(Property, on_delete=models.CASCADE, related_name='inspections')
    unit = models.ForeignKey(PropertyUnit, null=True, blank=True, on_delete=models.SET_NULL)
    inspection_type = models.CharField(max_length=20, choices=InspectionType.choices)
    status = models.CharField(max_length=20, choices=InspectionStatus.choices, default=InspectionStatus.SCHEDULED)
    inspection_date = models.DateField(null=True, blank=True) # Changed from scheduled_date to be consistent with PWA
    scheduled_date = models.DateTimeField(null=True, blank=True)
    completed_date = models.DateTimeField(null=True, blank=True)
    inspector = models.ForeignKey('hr.Employee', on_delete=models.SET_NULL, null=True)
    condition_data = models.JSONField(default=dict, blank=True)
    condition_rating = models.PositiveSmallIntegerField(null=True, blank=True, help_text='1-10 rating')
    findings = models.TextField(blank=True)
    action_required = models.TextField(blank=True)
    report_document = models.FileField(upload_to='inspections/%Y/%m/', null=True, blank=True)

    class Meta:
        db_table = 'properties_inspections'
        ordering = ['-inspection_date']

    def save(self, *args, **kwargs):
        if not self.reference:
            from apps.core.services.number_sequence import NumberSequenceService  # type: ignore
            self.reference = NumberSequenceService.get_next_number("Property Inspection", prefix="INSP-", padding=5)
        if not self.inspection_date and self.scheduled_date:
            self.inspection_date = self.scheduled_date.date()
        super().save(*args, **kwargs)
