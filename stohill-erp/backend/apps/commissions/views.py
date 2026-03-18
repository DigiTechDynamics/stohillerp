"""Stohil Properties - Commission Views"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from apps.commissions.models import CommissionRecord, CommissionStructure

class CommissionRecordViewSet(viewsets.ModelViewSet):
    queryset = CommissionRecord.objects.select_related('agent', 'property')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'agent', 'transaction_type']
    search_fields = ['reference', 'agent__last_name']
    ordering_fields = ['reference', 'calculation_date', 'amount', 'created_at']
    def get_serializer_class(self):
        from apps.commissions.serializers import CommissionRecordSerializer
        return CommissionRecordSerializer

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        record = self.get_object()
        if record.status != 'pending':
            return Response({'error': 'Only pending commissions can be approved'}, status=400)
        from django.utils import timezone
        from datetime import date
        record.status = 'approved'
        record.approved_by = request.user
        record.approved_date = date.today()
        record.save(update_fields=['status', 'approved_by', 'approved_date'])
        return Response({'status': 'approved'})

class CommissionStructureViewSet(viewsets.ModelViewSet):
    queryset = CommissionStructure.objects.all()
    permission_classes = [IsAuthenticated]
    def get_serializer_class(self):
        from apps.commissions.serializers import CommissionStructureSerializer
        return CommissionStructureSerializer
