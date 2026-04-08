from django.db import models
from apps.core.models import AuditedModel, TimeStampedModel
from decimal import Decimal

class PurchaseOrder(AuditedModel):
    """
    Purchase Order tracking.
    Lifecycle: Draft -> MD Approval -> Finance Approval -> PO Confirmed -> Received -> Billed.
    """
    class OrderStatus(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        PENDING_MD = 'pending_md', 'Pending MD Approval'
        PENDING_FINANCE = 'pending_finance', 'Pending Finance Approval'
        PO = 'purchase', 'Purchase Order'
        RECEIVED = 'received', 'Products Received'
        BILLED = 'billed', 'Billed'
        CANCELLED = 'cancel', 'Cancelled'

    reference = models.CharField(max_length=20, unique=True, default='New')
    vendor = models.ForeignKey('finance.Supplier', on_delete=models.PROTECT, related_name='purchase_orders')
    order_date = models.DateField(auto_now_add=True)
    expected_arrival = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=OrderStatus.choices, default=OrderStatus.DRAFT)
    
    # 2-Stage Approval
    md_approver = models.ForeignKey(
        'core.User', null=True, blank=True, 
        on_delete=models.SET_NULL, related_name='md_approved_pos'
    )
    md_approved_at = models.DateTimeField(null=True, blank=True)
    finance_approver = models.ForeignKey(
        'core.User', null=True, blank=True, 
        on_delete=models.SET_NULL, related_name='finance_approved_pos'
    )
    finance_approved_at = models.DateTimeField(null=True, blank=True)

    # Financial Totals
    subtotal = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    
    incoterms = models.CharField(max_length=50, blank=True, help_text='International Commerce Terms')
    notes = models.TextField(blank=True)
    
    # Integration links
    supplier_invoice = models.ForeignKey('finance.SupplierInvoice', on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return self.reference

class PurchaseOrderLine(models.Model):
    """Lines within a PO specifying products and costs."""
    purchase_order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='lines')
    product = models.ForeignKey('inventory.Product', on_delete=models.PROTECT)
    description = models.TextField(blank=True)
    quantity = models.DecimalField(max_digits=18, decimal_places=3)
    quantity_received = models.DecimalField(max_digits=18, decimal_places=3, default=0)
    unit_price = models.DecimalField(max_digits=18, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=18, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=18, decimal_places=2)

    def __str__(self):
        return f"{self.product.name} ({self.quantity})"
