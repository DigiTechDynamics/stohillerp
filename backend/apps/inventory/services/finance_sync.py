import logging
from decimal import Decimal
from django.db import transaction
from apps.inventory.models import Product, Warehouse
from apps.finance.services.accounting import AccountingService, PostingData

logger = logging.getLogger('stohill.inventory.sync')

class InventoryFinanceSyncService:
    """
    Synchronizes Inventory movements (GRNs, Stock Adjustments) with the General Ledger.
    """

    @classmethod
    @transaction.atomic
    def sync_grn_to_gl(cls, purchase_order):
        """
        Post the value of received goods to the General Ledger.
        Debit: Inventory (Asset)
        Credit: Goods Received Not Invoiced (Accrual Liability)
        """
        service = AccountingService()
        
        # 1. Prepare Posting Data
        posting = PostingData(
            description=f"GRN: {purchase_order.reference} from {purchase_order.vendor.name}",
            entry_date=purchase_order.date_order,
            source_module='procurement',
            source_id=purchase_order.id,
            source_reference=purchase_order.reference,
            currency_code=purchase_order.vendor.currency.code if purchase_order.vendor.currency else 'USD'
        )

        grni_account_code = service.get_account('GRNI_ACCRUAL')
        
        # 2. Build Lines per Product Line
        for line in purchase_order.lines.all():
            if line.quantity_received > 0:
                # Determine asset account (Product specific or Default)
                asset_account_code = '1510' # PROPERTY_INVENTORY default
                if line.product.inventory_account:
                    asset_account_code = line.product.inventory_account.code
                else:
                    asset_account_code = service.get_account('PROPERTY_INVENTORY')
                
                value = line.quantity_received * line.unit_price
                
                posting.add_debit(
                    asset_account_code, 
                    value, 
                    description=f"Stock Receipt: {line.product.name}"
                )
                posting.add_credit(
                    grni_account_code, 
                    value, 
                    description=f"GRNI Accrual: {line.product.sku}"
                )

        # 3. Post to GL
        if posting.lines:
            try:
                je = service.post_entry(posting, journal_code='GJ')
                logger.info(f"Synchronized GRN for PO {purchase_order.reference} to GL: {je.reference}")
                return je
            except Exception as e:
                logger.error(f"Failed to sync GRN for PO {purchase_order.reference}: {str(e)}")
                raise
        return None
