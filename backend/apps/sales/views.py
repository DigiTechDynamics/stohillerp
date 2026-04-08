"""Stohil Properties - Sales Views"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Sum, Count, Q
from apps.sales.models import SaleTransaction


class SaleTransactionViewSet(viewsets.ModelViewSet):
    queryset = SaleTransaction.objects.select_related('property', 'buyer', 'listing_agent', 'selling_agent')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'listing_agent', 'selling_agent']
    search_fields = ['sale_reference', 'property__reference_number', 'buyer__last_name']
    ordering_fields = ['offer_date', 'sale_price', 'created_at', 'sale_reference', 'property__name', 'buyer__last_name']

    def get_serializer_class(self):
        from apps.sales.serializers import SaleTransactionSerializer
        return SaleTransactionSerializer

    @action(detail=False, methods=['get'])
    def kanban(self, request):
        """
        Return all active sales grouped by pipeline stage for the Kanban board.
        Excludes cancelled deals; returns lightweight card data.
        """
        qs = SaleTransaction.objects.select_related(
            'property', 'buyer', 'listing_agent', 'selling_agent'
        ).exclude(status=SaleTransaction.TransactionStatus.CANCELLED)

        # Optional agent filter
        agent_id = request.query_params.get('agent')
        if agent_id:
            qs = qs.filter(Q(listing_agent_id=agent_id) | Q(selling_agent_id=agent_id))

        from apps.sales.serializers import SaleTransactionSerializer
        serializer = SaleTransactionSerializer(qs, many=True)
        data = serializer.data

        # Group by status
        stages = [
            SaleTransaction.TransactionStatus.OFFER_SUBMITTED,
            SaleTransaction.TransactionStatus.OFFER_ACCEPTED,
            SaleTransaction.TransactionStatus.SUSPENSIVE_CONDITIONS,
            SaleTransaction.TransactionStatus.BOND_APPROVED,
            SaleTransaction.TransactionStatus.TRANSFER_IN_PROGRESS,
            SaleTransaction.TransactionStatus.REGISTERED,
            SaleTransaction.TransactionStatus.CANCELLED,
        ]
        stage_labels = {
            'offer_submitted': 'Offer Submitted',
            'offer_accepted': 'Offer Accepted',
            'suspensive': 'Suspensive Conditions',
            'bond_approved': 'Bond Approved',
            'transfer': 'Transfer in Progress',
            'registered': 'Registered / Complete',
            'cancelled': 'Cancelled / Fallen Through',
        }
        grouped = {s: [] for s in stages}
        for tx in data:
            stage = tx.get('status')
            if stage in grouped:
                grouped[stage].append(tx)

        columns = [
            {
                'id': s,
                'label': stage_labels.get(s, s),
                'deals': grouped[s],
                'total_value': sum(float(d.get('sale_price', 0) or 0) for d in grouped[s]),
            }
            for s in stages
        ]
        return Response({'columns': columns})

    @action(detail=True, methods=['patch'])
    def update_status(self, request, pk=None):
        """
        Move a deal to a new pipeline stage (Kanban drag-and-drop).
        Body: { "status": "<new_status>" }
        Also propagates to Supabase if the deal is fully registered.
        """
        sale = self.get_object()
        new_status = request.data.get('status')
        valid_statuses = [c[0] for c in SaleTransaction.TransactionStatus.choices]
        if new_status not in valid_statuses:
            return Response(
                {'error': f'Invalid status. Must be one of: {valid_statuses}'},
                status=400,
            )

        old_status = sale.status
        sale.status = new_status

        # Auto-set accepted_date when moving to offer_accepted
        from django.utils import timezone
        if new_status == SaleTransaction.TransactionStatus.OFFER_ACCEPTED and not sale.accepted_date:
            sale.accepted_date = timezone.now().date()

        # Auto-set transfer_date when registered
        if new_status == SaleTransaction.TransactionStatus.REGISTERED and not sale.transfer_date:
            sale.transfer_date = timezone.now().date()
            # Update property status to SOLD
            from apps.properties.models import Property
            sale.property.status = Property.PropertyStatus.SOLD
            sale.property.save(update_fields=['status'])

        sale.save()
        # Ensure updated_by is tracked (AuditedModel)
        sale.updated_by = request.user
        sale.save(update_fields=['status', 'accepted_date', 'transfer_date', 'updated_at', 'updated_by'])
        from apps.sales.serializers import SaleTransactionSerializer
        return Response(SaleTransactionSerializer(sale).data)

    @action(detail=True, methods=['post'])
    def post_to_finance(self, request, pk=None):
        """Post completed sale to finance module."""
        sale = self.get_object()
        if sale.is_posted_to_finance:
            return Response({'error': 'Already posted to finance'}, status=400)
        if sale.status != SaleTransaction.TransactionStatus.REGISTERED:
            return Response({'error': 'Can only post registered (completed) sales'}, status=400)
        try:
            from apps.finance.services.accounting import AccountingService
            service = AccountingService(user=request.user)
            entry = service.post_sale_transaction(sale)
            sale.journal_entry = entry
            sale.is_posted_to_finance = True
            sale.save(update_fields=['journal_entry', 'is_posted_to_finance'])
            
            # If the entry has a source_id (invoice), return it
            return Response({
                'status': 'posted', 
                'journal_reference': entry.reference,
                'source_id': entry.source_id,
                'source_module': entry.source_module
            })
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=True, methods=['post'])
    def confirm_deal(self, request, pk=None):
        """Mark deal as registered and update closing date."""
        from django.utils import timezone
        sale = self.get_object()
        
        # Update status and dates
        sale.status = SaleTransaction.TransactionStatus.REGISTERED
        sale.transfer_date = timezone.now().date()
        if not sale.accepted_date:
            sale.accepted_date = timezone.now().date()
            
        sale.save(update_fields=['status', 'transfer_date', 'accepted_date'])
        
        # Update Property Status to SOLD
        prop = sale.property
        from apps.properties.models import Property
        prop.status = Property.PropertyStatus.SOLD
        prop.save(update_fields=['status'])
        
        return Response({
            'status': 'confirmed',
            'closing_date': sale.transfer_date,
            'transaction_status': sale.status
        })

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """
        Get summarized sales performance metrics: YTD, MTD, Active Pipeline.
        Fixes GAP-4.
        """
        from django.utils import timezone
        from datetime import date
        from django.db.models import Sum, Q

        today = date.today()
        month_start = today.replace(day=1)
        year_start = today.replace(month=1, day=1)

        # 1. YTD Revenue (Registered only)
        ytd_revenue = SaleTransaction.objects.filter(
            status=SaleTransaction.TransactionStatus.REGISTERED,
            transfer_date__year=today.year
        ).aggregate(total=Sum('sale_price'))['total'] or 0

        # 2. MTD Revenue (Registered only)
        mtd_revenue = SaleTransaction.objects.filter(
            status=SaleTransaction.TransactionStatus.REGISTERED,
            transfer_date__gte=month_start
        ).aggregate(total=Sum('sale_price'))['total'] or 0

        # 3. Active Pipeline (All except terminal states)
        pipeline = SaleTransaction.objects.exclude(
            status__in=[
                SaleTransaction.TransactionStatus.REGISTERED,
                SaleTransaction.TransactionStatus.CANCELLED
            ]
        )
        active_count = pipeline.count()
        pipeline_value = pipeline.aggregate(total=Sum('sale_price'))['total'] or 0
        
        # 4. Completed MTD
        mtd_completed = SaleTransaction.objects.filter(
            status=SaleTransaction.TransactionStatus.REGISTERED,
            transfer_date__gte=month_start
        ).count()

        from django.conf import settings
        return Response({
            'ytd_revenue': float(ytd_revenue),
            'mtd_revenue': float(mtd_revenue),
            'active_count': active_count,
            'pipeline_value': float(pipeline_value),
            'mtd_completed': mtd_completed,
            'currency': settings.COMPANY_CONFIG.get('currency', 'USD'),
        })
