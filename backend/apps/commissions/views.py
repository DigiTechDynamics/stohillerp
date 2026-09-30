"""Stohil Properties - Commission Views"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from apps.commissions.models import CommissionRecord, CommissionStructure

class CommissionRecordViewSet(viewsets.ModelViewSet):
    queryset = CommissionRecord.objects.select_related('agent', 'property')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'agent', 'transaction_type']

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Headline commission figures from the recorded commissions."""
        from decimal import Decimal

        from django.db.models import Avg, Q, Sum
        from django.utils import timezone

        today = timezone.localdate()
        year_start, month_start = today.replace(month=1, day=1), today.replace(day=1)
        zero = Decimal('0')
        S = CommissionRecord.CommissionStatus
        records = CommissionRecord.objects.all()
        paid_ytd = records.filter(status=S.PAID).filter(
            Q(payment_date__gte=year_start) | Q(payment_date__isnull=True, created_at__date__gte=year_start)
        ).aggregate(t=Sum('net_commission'))['t'] or zero
        awaiting = records.filter(status__in=[S.CALCULATED, S.PENDING_APPROVAL]).aggregate(t=Sum('net_commission'))['t'] or zero
        approved_unpaid = records.filter(status=S.APPROVED).aggregate(t=Sum('net_commission'))['t'] or zero
        earned_ytd = records.filter(status__in=[S.APPROVED, S.PAID], created_at__date__gte=year_start)
        average = earned_ytd.aggregate(a=Avg('net_commission'))['a']
        top = (records.filter(status__in=[S.APPROVED, S.PAID], created_at__date__gte=month_start)
               .values('agent', 'agent__first_name', 'agent__last_name')
               .annotate(total=Sum('net_commission')).order_by('-total').first())
        return Response({
            'paid_ytd': str(paid_ytd),
            'pending_approval': str(awaiting),
            'approved_unpaid': str(approved_unpaid),
            'average_ytd': str(round(average, 2)) if average is not None else None,
            'count_ytd': earned_ytd.count(),
            'top_earner_mtd': {
                'name': f"{top['agent__first_name']} {top['agent__last_name']}".strip(),
                'total': str(top['total']),
            } if top else None,
        })
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
        from django.db import transaction
        from apps.finance.services.accounting import AccountingError, AccountingService
        try:
            with transaction.atomic():
                record.status = 'approved'
                record.approved_by = request.user
                record.approved_date = date.today()
                record.save(update_fields=['status', 'approved_by', 'approved_date'])
                # Approval is when the expense is incurred: accrue it in the GL.
                entry = AccountingService(user=request.user).accrue_commission(record)
        except AccountingError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({'status': 'approved', 'journal_entry': entry.reference})

class CommissionStructureViewSet(viewsets.ModelViewSet):
    queryset = CommissionStructure.objects.all()
    def get_serializer_class(self):
        from apps.commissions.serializers import CommissionStructureSerializer
        return CommissionStructureSerializer
