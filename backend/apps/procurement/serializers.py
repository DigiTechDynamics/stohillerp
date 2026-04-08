from rest_framework import serializers
from apps.procurement.models import PurchaseOrder, PurchaseOrderLine
from apps.inventory.serializers import ProductSerializer

class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    product_name = serializers.ReadOnlyField(source='product.name')
    
    class Meta:
        model = PurchaseOrderLine
        fields = ['id', 'product', 'product_name', 'description', 'quantity', 'quantity_received', 'unit_price', 'tax_amount', 'line_total']

class PurchaseOrderSerializer(serializers.ModelSerializer):
    vendor_name = serializers.ReadOnlyField(source='vendor.name')
    lines = PurchaseOrderLineSerializer(many=True, required=False)
    
    class Meta:
        model = PurchaseOrder
        fields = [
            'id', 'reference', 'vendor', 'vendor_name', 'order_date', 
            'expected_arrival', 'status', 'subtotal', 'tax_total', 'total_amount', 
            'incoterms', 'notes', 'lines',
            'md_approver', 'md_approved_at', 'finance_approver', 'finance_approved_at'
        ]
