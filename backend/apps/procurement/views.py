from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from apps.procurement.models import PurchaseOrder, PurchaseOrderLine
from apps.procurement.serializers import PurchaseOrderSerializer, PurchaseOrderLineSerializer
from apps.procurement.services.procurement_service import ProcurementService
from apps.inventory.models import Warehouse
import logging

logger = logging.getLogger(__name__)

class PurchaseOrderViewSet(viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.select_related('vendor').prefetch_related('lines__product').order_by('-order_date')
    serializer_class = PurchaseOrderSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'vendor']
    search_fields = ['reference']
    ordering_fields = ['order_date', 'total_amount']

    @action(detail=True, methods=['post'])
    def confirm_po(self, request, pk=None):
        """Initial submission: Draft -> Pending MD Approval"""
        po = self.get_object()
        if po.status != PurchaseOrder.OrderStatus.DRAFT:
            return Response({'error': 'Only draft orders can be submitted for approval'}, status=400)
        po.status = PurchaseOrder.OrderStatus.PENDING_MD
        po.save()
        return Response({'status': 'Submitted for MD approval', 'new_status': po.status})

    @action(detail=True, methods=['post'])
    def approve_md(self, request, pk=None):
        """First approval: Pending MD -> Pending Finance"""
        po = self.get_object()
        if po.status != PurchaseOrder.OrderStatus.PENDING_MD:
            return Response({'error': 'Order is not pending MD approval'}, status=400)
        
        from django.utils import timezone
        po.md_approver = request.user
        po.md_approved_at = timezone.now()
        po.status = PurchaseOrder.OrderStatus.PENDING_FINANCE
        po.save()
        return Response({'status': 'Approved by MD', 'new_status': po.status})

    @action(detail=True, methods=['post'])
    def approve_finance(self, request, pk=None):
        """Second approval: Pending Finance -> Purchase Order (Confirmed)"""
        po = self.get_object()
        if po.status != PurchaseOrder.OrderStatus.PENDING_FINANCE:
            return Response({'error': 'Order is not pending Finance approval'}, status=400)
        
        from django.utils import timezone
        po.finance_approver = request.user
        po.finance_approved_at = timezone.now()
        po.status = PurchaseOrder.OrderStatus.PO
        po.save()
        return Response({'status': 'Approved by Finance. PO Confirmed.', 'new_status': po.status})

    @action(detail=True, methods=['post'])
    def receive_products(self, request, pk=None):
        po = self.get_object()
        warehouse_id = request.data.get('warehouse')
        
        # Simplified "no warehouse" - use default if none provided
        try:
            if not warehouse_id:
                # Get or create a default warehouse
                warehouse, _ = Warehouse.objects.get_or_create(
                    code='MAIN', 
                    defaults={'name': 'Main Warehouse'}
                )
            else:
                warehouse = Warehouse.objects.get(id=warehouse_id)
                
            ProcurementService.receive_products(po, warehouse)
            return Response({'status': 'Products received', 'new_status': po.status})
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=True, methods=['post'])
    def create_bill(self, request, pk=None):
        po = self.get_object()
        if po.status != PurchaseOrder.OrderStatus.RECEIVED:
             return Response({'error': 'Order must be received before billing'}, status=400)
        try:
            invoice = ProcurementService.create_vendor_bill(po)
            return Response({
                'status': 'Billed', 
                'invoice_id': invoice.id,
                'invoice_reference': invoice.reference
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)
