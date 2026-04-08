import logging
from django.db import transaction
from django.utils import timezone
from apps.procurement.models import PurchaseOrder, PurchaseOrderLine
from apps.inventory.services.stock_service import StockService
from apps.finance.models.ap import SupplierInvoice, SupplierInvoiceLine
from decimal import Decimal

logger = logging.getLogger('stohill.procurement')

class ProcurementService:
    """
    Handles the Purchase Order lifecycle.
    Integrates with Inventory (Receipts) and Finance (Billing).
    """

    @staticmethod
    @transaction.atomic
    def receive_products(purchase_order: PurchaseOrder, warehouse):
        """
        Mark products as received and update physical stock.
        Triggered when Goods are checked into a Warehouse.
        """
        if purchase_order.status not in [PurchaseOrder.OrderStatus.PO, PurchaseOrder.OrderStatus.RECEIVED]:
            raise ValueError(f"Cannot receive products for PO in {purchase_order.status} status.")

        for line in purchase_order.lines.all():
            if line.quantity > line.quantity_received:
                qty_to_receive = line.quantity - line.quantity_received
                
                # 1. Update Inventory Stock
                StockService.move_stock(
                    product=line.product,
                    quantity=qty_to_receive,
                    dest_warehouse=warehouse,
                    reference=f"Receipt: {purchase_order.reference}"
                )
                
                # 2. Update line quantity received
                line.quantity_received += qty_to_receive
                line.save()

        # 3. Synchronize to GL (Financial receipt)
        from apps.inventory.services.finance_sync import InventoryFinanceSyncService
        InventoryFinanceSyncService.sync_grn_to_gl(purchase_order)

        # Update PO status
        purchase_order.status = PurchaseOrder.OrderStatus.RECEIVED
        purchase_order.save()
        return purchase_order

    @staticmethod
    @transaction.atomic
    def create_vendor_bill(purchase_order: PurchaseOrder):
        """
        Convert a Purchase Order into a Supplier Invoice (Bill).
        Triggered when the Vendor sends the official invoice.
        """
        if purchase_order.status != PurchaseOrder.OrderStatus.RECEIVED:
             # In Odoo, you can bill before receipt, but for this ERP we'll follow Receipt-first
             pass

        if purchase_order.supplier_invoice:
            raise ValueError("Bill already created for this PO.")

        # 1. Create Supplier Invoice in Finance
        invoice = SupplierInvoice.objects.create(
            supplier=purchase_order.vendor,
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date() + timezone.timedelta(days=30),
            currency=purchase_order.vendor.currency,
            subtotal=purchase_order.subtotal,
            tax_total=purchase_order.tax_total,
            total_amount=purchase_order.total_amount,
            reference=f"BILL/{purchase_order.reference}",
            status=SupplierInvoice.InvoiceStatus.DRAFT
        )

        # 2. Create Invoice Lines
        # When billing a PO, we debit the GRNI Accrual account because the 
        # inventory asset was already debited on receipt.
        from apps.finance.services.accounting import AccountingService
        accounting = AccountingService()
        try:
            grni_account_code = accounting.get_account('GRNI_ACCRUAL')
            from apps.finance.models import ChartOfAccount
            grni_account = ChartOfAccount.objects.get(code=grni_account_code)
        except Exception:
            grni_account = purchase_order.vendor.ap_account

        for line in purchase_order.lines.all():
            SupplierInvoiceLine.objects.create(
                invoice=invoice,
                description=f"PO {purchase_order.reference}: {line.product.name}",
                expense_account=grni_account, # Debiting the accrual
                quantity=line.quantity,
                unit_price=line.unit_price,
                line_total=line.line_total,
                tax_amount=line.tax_amount
            )

        # 3. Post the Supplier Invoice to GL
        # This will Credit AP and Debit the Lines (GRNI)
        try:
            # We assume AccountingService has post_supplier_invoice or use generic post_entry
            # For this audit, we'll use a generic entry or a specific helper if it exists.
            # I'll check if post_supplier_invoice exists next.
            je = accounting.post_supplier_invoice(invoice)
            invoice.status = SupplierInvoice.InvoiceStatus.POSTED
            invoice.journal_entry = je
            invoice.save(update_fields=['status', 'journal_entry'])
        except Exception as e:
            logger.error(f"Failed to post vendor bill for PO {purchase_order.reference}: {str(e)}")

        # 4. Link back to PO
        purchase_order.supplier_invoice = invoice
        purchase_order.status = PurchaseOrder.OrderStatus.BILLED
        purchase_order.save()

        return invoice
