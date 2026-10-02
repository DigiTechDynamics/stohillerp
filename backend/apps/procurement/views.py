"""
Purchasing API.

  CRUD orders/                      nested lines; edit only while draft
  GET  orders/{id}/approval_status/, POST approve/ reject/   (approval rules, type purchase_order)
  POST orders/{id}/issue/           requires approval where rules apply
  POST orders/{id}/receive/         {"lines": [{"line": id, "quantity"}], "date"?, "delivery_note"?}
  POST orders/{id}/create_invoice/  {"invoice_number", "invoice_date"?} draft supplier invoice from receipts
  POST orders/{id}/cancel/
  GET  receipts/                    goods received notes
"""

from datetime import date
from decimal import Decimal

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.finance.approval_views import ApprovalActions
from apps.procurement import services
from apps.procurement.models import GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine
from utils.record_rules import RecordRulesMixin


class PurchaseOrderLineSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    expense_account_code = serializers.CharField(source='expense_account.code', read_only=True)
    line_total = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrderLine
        fields = ['id', 'description', 'expense_account', 'expense_account_code', 'quantity', 'unit_price',
                  'tax_code', 'line_total', 'received_qty', 'invoiced_qty']
        read_only_fields = ['received_qty', 'invoiced_qty']

    def validate(self, attrs):
        if attrs.get('quantity', 1) <= 0 or attrs.get('unit_price', 0) < 0:
            raise serializers.ValidationError('Quantity must be positive and price not negative.')
        return attrs


class PurchaseOrderSerializer(serializers.ModelSerializer):
    lines = PurchaseOrderLineSerializer(many=True)
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    project_code = serializers.CharField(source='project.code', read_only=True, default=None)
    total_amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)

    class Meta:
        model = PurchaseOrder
        fields = ['id', 'number', 'supplier', 'supplier_name', 'order_date', 'expected_date', 'currency', 'status',
                  'property_ref', 'cost_center', 'project', 'project_code', 'notes', 'issued_at', 'total_amount',
                  'lines']
        read_only_fields = ['number', 'status', 'issued_at']

    def validate(self, attrs):
        if self.instance and self.instance.status != PurchaseOrder.Status.DRAFT:
            raise serializers.ValidationError('Only draft purchase orders can be changed.')
        if 'lines' in attrs and not attrs['lines']:
            raise serializers.ValidationError({'lines': 'Add at least one line.'})
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        lines = validated_data.pop('lines')
        order = PurchaseOrder.objects.create(**validated_data)
        for line in lines:
            line.pop('id', None)
            PurchaseOrderLine.objects.create(order=order, **line)
        return order

    @transaction.atomic
    def update(self, instance, validated_data):
        lines = validated_data.pop('lines', None)
        instance = super().update(instance, validated_data)
        if lines is not None:
            instance.lines.all().delete()
            for line in lines:
                line.pop('id', None)
                PurchaseOrderLine.objects.create(order=instance, **line)
        return instance


class GoodsReceiptLineSerializer(serializers.ModelSerializer):
    description = serializers.CharField(source='order_line.description', read_only=True)

    class Meta:
        model = GoodsReceiptLine
        fields = ['id', 'order_line', 'description', 'quantity']


class GoodsReceiptSerializer(serializers.ModelSerializer):
    lines = GoodsReceiptLineSerializer(many=True, read_only=True)
    order_number = serializers.CharField(source='order.number', read_only=True)

    class Meta:
        model = GoodsReceipt
        fields = ['id', 'number', 'order', 'order_number', 'receipt_date', 'delivery_note', 'notes', 'lines']


def _date(value):
    if not value:
        return timezone.localdate()
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ValidationError({'date': 'Use YYYY-MM-DD.'})


class PurchaseOrderViewSet(RecordRulesMixin, ApprovalActions, viewsets.ModelViewSet):
    queryset = PurchaseOrder.objects.select_related('supplier', 'project').prefetch_related('lines__expense_account')
    serializer_class = PurchaseOrderSerializer
    filterset_fields = ['status', 'supplier', 'project', 'property_ref']
    search_fields = ['number', 'supplier__name', 'notes']
    ordering_fields = ['order_date', 'number']

    def destroy(self, request, *args, **kwargs):
        if self.get_object().status != PurchaseOrder.Status.DRAFT:
            raise ValidationError({'detail': 'Only draft orders can be deleted; cancel it instead.'})
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    def issue(self, request, pk=None):
        return Response(PurchaseOrderSerializer(services.issue(self.get_object(), request.user)).data)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        return Response(PurchaseOrderSerializer(services.cancel(self.get_object())).data)

    @action(detail=True, methods=['post'])
    def receive(self, request, pk=None):
        order = self.get_object()
        rows = request.data.get('lines') or []
        try:
            quantities = [(get_object_or_404(PurchaseOrderLine, pk=row['line'], order=order),
                           Decimal(str(row['quantity']))) for row in rows]
        except (KeyError, ArithmeticError):
            raise ValidationError({'lines': 'Provide [{"line": id, "quantity": number}].'})
        receipt = services.receive(order, quantities, _date(request.data.get('date')),
                                   request.data.get('delivery_note', ''), request.user)
        return Response(GoodsReceiptSerializer(receipt).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def create_invoice(self, request, pk=None):
        from apps.finance.serializers import SupplierInvoiceSerializer

        invoice = services.create_invoice(self.get_object(), request.data.get('invoice_number', ''),
                                          _date(request.data.get('invoice_date')), request.user)
        return Response(SupplierInvoiceSerializer(invoice).data, status=status.HTTP_201_CREATED)


class GoodsReceiptViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = GoodsReceipt.objects.select_related('order').prefetch_related('lines__order_line')
    serializer_class = GoodsReceiptSerializer
    filterset_fields = ['order']
