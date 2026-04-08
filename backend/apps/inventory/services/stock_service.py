from django.db import transaction
from django.db.models import F
from apps.inventory.models import StockMove, StockQuant, Warehouse, Product
from decimal import Decimal

class StockService:
    """
    Central service for double-entry stock movements.
    Ensures data consistency and valuation record-keeping.
    """

    @staticmethod
    @transaction.atomic
    def move_stock(product: Product, quantity: Decimal, source_warehouse=None, dest_warehouse=None, reference='Adjustment'):
        """
        Record a stock move and update quants.
        If source_warehouse is None -> Stock In (Initial/Purchase)
        If dest_warehouse is None -> Stock Out (Scrap/Sale)
        """
        if quantity <= 0:
            raise ValueError("Move quantity must be positive")

        # 1. Create Stock Move Record
        move = StockMove.objects.create(
            product=product,
            source_warehouse=source_warehouse,
            dest_warehouse=dest_warehouse,
            quantity=quantity,
            reference=reference
        )

        # 2. Update Source Quant (Decrease)
        if source_warehouse:
            quant_src, _ = StockQuant.objects.get_or_create(
                product=product,
                warehouse=source_warehouse,
                defaults={'quantity_on_hand': 0}
            )
            if quant_src.quantity_on_hand < quantity and not product.product_type == Product.ProductType.CONSUMABLE:
                 # Optional: Warn about negative stock if not consumable
                 pass
            
            StockQuant.objects.filter(pk=quant_src.pk).update(
                quantity_on_hand=F('quantity_on_hand') - quantity
            )

        # 3. Update Destination Quant (Increase)
        if dest_warehouse:
            quant_dest, _ = StockQuant.objects.get_or_create(
                product=product,
                warehouse=dest_warehouse,
                defaults={'quantity_on_hand': 0}
            )
            StockQuant.objects.filter(pk=quant_dest.pk).update(
                quantity_on_hand=F('quantity_on_hand') + quantity
            )

        return move

    @staticmethod
    def get_stock_level(product: Product, warehouse=None):
        """Get current quantity on hand."""
        if warehouse:
            quant = StockQuant.objects.filter(product=product, warehouse=warehouse).first()
            return quant.quantity_on_hand if quant else 0
        
        # All warehouses
        from django.db.models import Sum
        return StockQuant.objects.filter(product=product).aggregate(total=Sum('quantity_on_hand'))['total'] or 0
