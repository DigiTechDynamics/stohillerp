from django.db import models
from apps.core.models import AuditedModel, TimeStampedModel
from decimal import Decimal

class Product(AuditedModel):
    """
    Electronic record of any inventory item or service.
    Follows Odoo 'Product' architecture.
    """
    class ProductType(models.TextChoices):
        STORABLE = 'storable', 'Storable Product'
        CONSUMABLE = 'consumable', 'Consumable'
        SERVICE = 'service', 'Service'

    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=100, unique=True, db_index=True)
    barcode = models.CharField(max_length=100, blank=True, null=True)
    product_type = models.CharField(max_length=20, choices=ProductType.choices, default=ProductType.STORABLE)
    category = models.CharField(max_length=100, default='All')
    
    # Financials
    cost_price = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    sale_price = models.DecimalField(max_digits=18, decimal_places=2, default=Decimal('0.00'))
    uom = models.CharField(max_length=20, default='Units', help_text='Unit of Measure')
    
    # Financial Accounts for synchronization
    inventory_account = models.ForeignKey(
        'finance.ChartOfAccount', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='products_inventory', help_text="Asset account for stock on hand"
    )
    expense_account = models.ForeignKey(
        'finance.ChartOfAccount', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='products_expense', help_text="COGS or Expense account"
    )
    income_account = models.ForeignKey(
        'finance.ChartOfAccount', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='products_income', help_text="Revenue account for sales"
    )
    
    is_active = models.BooleanField(default=True)
    description = models.TextField(blank=True)

    def __str__(self):
        return f"[{self.sku}] {self.name}"

class Warehouse(AuditedModel):
    """Physical storage location."""
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=20, unique=True)
    address = models.TextField(blank=True)

    def __str__(self):
        return self.name

class StockMove(TimeStampedModel):
    """
    Double-entry stock move record.
    Stock moves from Source to Destination.
    """
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='stock_moves')
    source_warehouse = models.ForeignKey(Warehouse, on_delete=models.SET_NULL, null=True, blank=True, related_name='moves_out')
    dest_warehouse = models.ForeignKey(Warehouse, on_delete=models.SET_NULL, null=True, blank=True, related_name='moves_in')
    quantity = models.DecimalField(max_digits=18, decimal_places=3)
    reference = models.CharField(max_length=100, help_text='PO Reference, Adjustment Ref, etc')
    
    def __str__(self):
        return f"{self.product.name}: {self.source_warehouse} -> {self.dest_warehouse} ({self.quantity})"

class StockQuant(models.Model):
    """
    Denormalized current stock level for performance.
    Represents 'quantity on hand' at a specific warehouse.
    """
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='quants')
    warehouse = models.ForeignKey(Warehouse, on_delete=models.CASCADE, related_name='quants')
    quantity_on_hand = models.DecimalField(max_digits=18, decimal_places=3, default=0)
    
    class Meta:
        unique_together = ['product', 'warehouse']

    def __str__(self):
        return f"{self.product.sku} @ {self.warehouse.code}: {self.quantity_on_hand}"
