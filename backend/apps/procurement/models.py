"""
Purchasing: purchase orders, goods receipts, and the link from supplier
invoice lines back to PO lines for 3-way matching (PO / receipt / invoice).
"""

from decimal import Decimal

from django.db import models

from apps.core.models import AuditedModel


class PurchaseOrder(AuditedModel):
    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        ISSUED = 'issued', 'Issued to supplier'
        PARTIAL = 'partially_received', 'Partially received'
        RECEIVED = 'received', 'Fully received'
        CLOSED = 'closed', 'Closed (fully invoiced)'
        CANCELLED = 'cancelled', 'Cancelled'

    number = models.CharField(max_length=30, unique=True, blank=True)
    supplier = models.ForeignKey('finance.Supplier', on_delete=models.PROTECT, related_name='purchase_orders')
    order_date = models.DateField()
    expected_date = models.DateField(null=True, blank=True)
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    # Optional dimensions carried onto the supplier invoice lines.
    property_ref = models.ForeignKey('properties.Property', null=True, blank=True, on_delete=models.SET_NULL)
    cost_center = models.ForeignKey('finance.CostCenter', null=True, blank=True, on_delete=models.PROTECT)
    project = models.ForeignKey('projects.Project', null=True, blank=True, on_delete=models.PROTECT,
                                related_name='purchase_orders')
    notes = models.TextField(blank=True)
    issued_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'procurement_purchase_orders'
        ordering = ['-order_date', '-created_at']

    def __str__(self):
        return f'{self.number} - {self.supplier}'

    def save(self, *args, **kwargs):
        if not self.number:
            from apps.core.services.number_sequence import NumberSequenceService
            self.number = NumberSequenceService.get_next_number('Purchase Order', prefix='PO-', padding=5)
        super().save(*args, **kwargs)

    @property
    def total_amount(self) -> Decimal:
        return sum((line.line_total for line in self.lines.all()), Decimal('0.00'))

    def refresh_status(self):
        if self.status in (self.Status.DRAFT, self.Status.CANCELLED):
            return
        lines = list(self.lines.all())
        if lines and all(ln.invoiced_qty >= ln.quantity for ln in lines):
            status = self.Status.CLOSED
        elif lines and all(ln.received_qty >= ln.quantity for ln in lines):
            status = self.Status.RECEIVED
        elif any(ln.received_qty > 0 for ln in lines):
            status = self.Status.PARTIAL
        else:
            status = self.Status.ISSUED
        if status != self.status:
            self.status = status
            self.save(update_fields=['status'])


class PurchaseOrderLine(models.Model):
    order = models.ForeignKey(PurchaseOrder, on_delete=models.CASCADE, related_name='lines')
    description = models.CharField(max_length=255)
    expense_account = models.ForeignKey('finance.ChartOfAccount', on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=12, decimal_places=2)
    unit_price = models.DecimalField(max_digits=15, decimal_places=2)
    tax_code = models.ForeignKey('finance.TaxCode', null=True, blank=True, on_delete=models.PROTECT)
    # Set when the item is a fixed asset: the line books to the category's asset account and posting
    # its supplier invoice creates the asset(s) in the register.
    asset_category = models.ForeignKey('fixed_assets.AssetCategory', null=True, blank=True,
                                       on_delete=models.PROTECT, related_name='purchase_order_lines')
    received_qty = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))
    invoiced_qty = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0.00'))

    class Meta:
        db_table = 'procurement_purchase_order_lines'
        ordering = ['id']

    def __str__(self):
        return f'{self.order.number}: {self.description}'

    @property
    def line_total(self) -> Decimal:
        return (self.quantity * self.unit_price).quantize(Decimal('0.01'))


class GoodsReceipt(AuditedModel):
    number = models.CharField(max_length=30, unique=True, blank=True)
    order = models.ForeignKey(PurchaseOrder, on_delete=models.PROTECT, related_name='receipts')
    receipt_date = models.DateField()
    delivery_note = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'procurement_goods_receipts'
        ordering = ['-receipt_date', '-created_at']

    def save(self, *args, **kwargs):
        if not self.number:
            from apps.core.services.number_sequence import NumberSequenceService
            self.number = NumberSequenceService.get_next_number('Goods Receipt', prefix='GRN-', padding=5)
        super().save(*args, **kwargs)


class GoodsReceiptLine(models.Model):
    receipt = models.ForeignKey(GoodsReceipt, on_delete=models.CASCADE, related_name='lines')
    order_line = models.ForeignKey(PurchaseOrderLine, on_delete=models.PROTECT, related_name='receipt_lines')
    quantity = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = 'procurement_goods_receipt_lines'
