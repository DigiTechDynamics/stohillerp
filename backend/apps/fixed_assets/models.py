import uuid
from django.db import models
from django.core.exceptions import ValidationError
from decimal import Decimal
from apps.core.models import AuditedModel, TimeStampedModel

class AssetCategory(AuditedModel):
    """Classification for fixed assets (e.g., Buildings, Vehicles, IT)."""
    code = models.CharField(max_length=20, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    
    # Account Mappings - Using strings to avoid early registry access
    asset_cost_account = models.ForeignKey(
        'finance.ChartOfAccount', on_delete=models.PROTECT, related_name='cat_asset_accounts'
    )
    accum_depr_account = models.ForeignKey(
        'finance.ChartOfAccount', on_delete=models.PROTECT, related_name='cat_accum_depr_accounts'
    )
    depr_expense_account = models.ForeignKey(
        'finance.ChartOfAccount', on_delete=models.PROTECT, related_name='cat_depr_exp_accounts'
    )
    disposal_gain_loss_account = models.ForeignKey(
        'finance.ChartOfAccount', on_delete=models.PROTECT, related_name='cat_disposal_accounts'
    )
    # Used for assets created automatically (from purchase invoices); each asset can be changed later.
    default_useful_life_months = models.PositiveIntegerField(default=60)

    class Meta:
        db_table = 'fa_categories'
        verbose_name_plural = 'Asset Categories'

    def __str__(self):
        return f"{self.code} - {self.name}"

class FixedAsset(AuditedModel):
    """The primary asset record."""
    class Status(models.TextChoices):
        CIP = 'cip', 'Construction in Progress'
        ACTIVE = 'active', 'Active'
        DISPOSED = 'disposed', 'Disposed'
        SCRAPPED = 'scrapped', 'Scrapped'

    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=200)
    category = models.ForeignKey(AssetCategory, on_delete=models.PROTECT)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    
    acquisition_date = models.DateField()
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='fixed_assets', null=True, blank=True)
    acquisition_cost = models.DecimalField(max_digits=18, decimal_places=2)
    
    # Optional physical tracking
    serial_number = models.CharField(max_length=100, blank=True)
    barcode = models.CharField(max_length=100, blank=True)
    property_ref = models.ForeignKey(
        'properties.Property', null=True, blank=True, on_delete=models.SET_NULL
    )
    # The supplier invoice line it was bought on, when created from purchasing.
    purchase_invoice_line = models.ForeignKey(
        'finance.SupplierInvoiceLine', null=True, blank=True, on_delete=models.SET_NULL, related_name='fixed_assets'
    )

    class Meta:
        db_table = 'fa_assets'

    def __str__(self):
        return f"{self.code} - {self.name}"

class AssetBook(AuditedModel):
    """Valuation and depreciation rules for a specific reporting book."""
    class DeprMethod(models.TextChoices):
        STRAIGHT_LINE = 'straight_line', 'Straight Line'
        DECLINING_BALANCE = 'declining_balance', 'Declining Balance'
        DOUBLE_DECLINING = 'double_declining', 'Double Declining Balance'
        UNITS_OF_PRODUCTION = 'units_of_production', 'Units of Production'
        MANUAL = 'manual', 'Manual'

    asset = models.ForeignKey(FixedAsset, on_delete=models.CASCADE, related_name='books')
    book_type = models.CharField(max_length=50) # e.g., 'Statutory', 'Tax'
    # Only the statutory (accounting) book posts to the GL. Tax and other
    # memo books are calculated and tracked but must not post, or every
    # asset with two books was depreciated twice in the ledger.
    posts_to_gl = models.BooleanField(default=True)
    
    method = models.CharField(max_length=50, choices=DeprMethod.choices)
    useful_life_months = models.PositiveIntegerField()
    salvage_value = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    
    depreciation_rate = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True) # For declining balance
    
    # For Units of Production
    total_expected_units = models.DecimalField(max_digits=20, decimal_places=2, null=True, blank=True)
    consumed_units = models.DecimalField(max_digits=20, decimal_places=2, default=Decimal('0.00'))
    
    current_nbv = models.DecimalField(max_digits=18, decimal_places=2)
    accumulated_depreciation = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    
    last_depreciation_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'fa_asset_books'
        unique_together = ['asset', 'book_type']

    def __str__(self):
        return f"{self.asset.code} - {self.book_type}"

class AssetLocation(TimeStampedModel):
    """Physical location history of an asset."""
    asset = models.ForeignKey(FixedAsset, on_delete=models.CASCADE, related_name='locations')
    location_name = models.CharField(max_length=200)
    department = models.CharField(max_length=100, blank=True)
    transfer_date = models.DateField()
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'fa_asset_locations'

class AssetTransaction(AuditedModel):
    """Sub-ledger transactions for Fixed Assets."""
    class TransType(models.TextChoices):
        ACQUISITION = 'acquisition', 'Acquisition'
        DEPRECIATION = 'depreciation', 'Depreciation'
        REVALUATION = 'revaluation', 'Revaluation'
        IMPAIRMENT = 'impairment', 'Impairment'
        DISPOSAL = 'disposal', 'Disposal'

    asset = models.ForeignKey(FixedAsset, on_delete=models.CASCADE, related_name='transactions')
    book_type = models.CharField(max_length=50)
    transaction_date = models.DateField()
    amount = models.DecimalField(max_digits=18, decimal_places=2)
    transaction_type = models.CharField(max_length=20, choices=TransType.choices)
    
    # Link to GL entry
    journal_entry = models.ForeignKey(
        'finance.JournalEntry', null=True, blank=True, on_delete=models.SET_NULL
    )
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'fa_transactions'
        ordering = ['-transaction_date', '-created_at']
