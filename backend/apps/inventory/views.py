from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from apps.inventory.models import Product, Warehouse, StockMove, StockQuant
from apps.inventory.serializers import (
    ProductSerializer, WarehouseSerializer, 
    StockMoveSerializer, StockQuantSerializer
)
from apps.inventory.services.stock_service import StockService
from decimal import Decimal

class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all().order_by('sku')
    serializer_class = ProductSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['product_type', 'category', 'is_active']
    search_fields = ['name', 'sku', 'barcode']

    @action(detail=True, methods=['get'])
    def stock_levels(self, request, pk=None):
        product = self.get_object()
        quants = StockQuant.objects.filter(product=product)
        serializer = StockQuantSerializer(quants, many=True)
        return Response(serializer.data)

class WarehouseViewSet(viewsets.ModelViewSet):
    queryset = Warehouse.objects.all().order_by('name')
    serializer_class = WarehouseSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'code']

class StockMoveViewSet(viewsets.ReadOnlyModelViewSet):
    """Stock moves are immutable history - ReadOnly."""
    queryset = StockMove.objects.select_related('product', 'source_warehouse', 'dest_warehouse').order_by('-created_at')
    serializer_class = StockMoveSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['product', 'source_warehouse', 'dest_warehouse']
    search_fields = ['reference']

    @action(detail=False, methods=['post'])
    def adjustment(self, request):
        """Create a manual stock adjustment move."""
        try:
            product_id = request.data.get('product')
            warehouse_id = request.data.get('warehouse')
            quantity = Decimal(str(request.data.get('quantity')))
            move_type = request.data.get('type') # 'in' or 'out'
            
            product = Product.objects.get(id=product_id)
            warehouse = Warehouse.objects.get(id=warehouse_id)
            
            if move_type == 'in':
                move = StockService.move_stock(product, quantity, dest_warehouse=warehouse, reference='Manual adjustment (In)')
            else:
                move = StockService.move_stock(product, quantity, source_warehouse=warehouse, reference='Manual adjustment (Out)')
                
            return Response(StockMoveSerializer(move).data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class StockQuantViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockQuant.objects.select_related('product', 'warehouse').all()
    serializer_class = StockQuantSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['product', 'warehouse']
