from rest_framework import serializers
from apps.inventory.models import Product, Warehouse, StockMove, StockQuant

class ProductSerializer(serializers.ModelSerializer):
    total_stock = serializers.SerializerMethodField()
    
    class Meta:
        model = Product
        fields = '__all__'
    
    def get_total_stock(self, obj):
        from django.db.models import Sum
        return obj.quants.aggregate(total=Sum('quantity_on_hand'))['total'] or 0

class WarehouseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Warehouse
        fields = '__all__'

class StockQuantSerializer(serializers.ModelSerializer):
    product_name = serializers.ReadOnlyField(source='product.name')
    warehouse_name = serializers.ReadOnlyField(source='warehouse.name')
    
    class Meta:
        model = StockQuant
        fields = ['id', 'product', 'product_name', 'warehouse', 'warehouse_name', 'quantity_on_hand']

class StockMoveSerializer(serializers.ModelSerializer):
    product_name = serializers.ReadOnlyField(source='product.name')
    source_warehouse_name = serializers.ReadOnlyField(source='source_warehouse.name')
    dest_warehouse_name = serializers.ReadOnlyField(source='dest_warehouse.name')
    
    class Meta:
        model = StockMove
        fields = ['id', 'product', 'product_name', 'source_warehouse', 'source_warehouse_name', 'dest_warehouse', 'dest_warehouse_name', 'quantity', 'reference', 'created_at']
