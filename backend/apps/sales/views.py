"""Stohil Properties - Sales Views"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from apps.sales.models import SaleTransaction
from apps.sales.stats import base_totals, pct_change
from utils.record_rules import RecordRulesMixin


class SaleTransactionViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = SaleTransaction.objects.select_related('property', 'buyer', 'listing_agent', 'selling_agent')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'listing_agent', 'selling_agent']

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Headline figures for the sales page, from the recorded transactions."""
        from django.db.models import Q
        from django.utils import timezone

        from apps.core.company import base_currency_code

        today = timezone.localdate()
        year_start, month_start = today.replace(month=1, day=1), today.replace(day=1)
        try:
            last_year_same_day = today.replace(year=today.year - 1)
        except ValueError:                      # 29 February
            last_year_same_day = today.replace(year=today.year - 1, day=28)
        registered = SaleTransaction.objects.filter(status=SaleTransaction.TransactionStatus.REGISTERED)
        missing_rates = set()

        def totals(qs):
            return base_totals(qs, missing_rates)

        ytd_count, ytd_value, ytd_commission = totals(registered.filter(transfer_date__gte=year_start,
                                                                        transfer_date__lte=today))
        _c, prior_value, _p = totals(registered.filter(transfer_date__gte=year_start.replace(year=today.year - 1),
                                                       transfer_date__lte=last_year_same_day))
        active = SaleTransaction.objects.exclude(status__in=[SaleTransaction.TransactionStatus.REGISTERED,
                                                             SaleTransaction.TransactionStatus.CANCELLED])
        active_count, active_value, _a = totals(active)
        in_transfer = active.filter(Q(status=SaleTransaction.TransactionStatus.TRANSFER_IN_PROGRESS) |
                                    Q(status=SaleTransaction.TransactionStatus.BOND_APPROVED))
        pending_count, pending_value, _t = totals(in_transfer)
        mtd_count, mtd_value, _m = totals(registered.filter(transfer_date__gte=month_start, transfer_date__lte=today))
        return Response({
            'ytd_count': ytd_count, 'ytd_value': str(ytd_value), 'ytd_commission': str(ytd_commission),
            'ytd_change_pct': pct_change(ytd_value, prior_value),
            'active_count': active_count, 'active_value': str(active_value),
            'pending_completion_count': pending_count, 'pending_completion_value': str(pending_value),
            'completed_mtd_count': mtd_count, 'completed_mtd_value': str(mtd_value),
            'currency': base_currency_code(),
            # Sales in these currencies had no exchange rate for their date and are left out.
            'missing_rates': sorted(missing_rates),
        })
    search_fields = ['sale_reference', 'property__reference_number', 'buyer__last_name']
    ordering_fields = ['offer_date', 'sale_price', 'created_at', 'sale_reference', 'property__name', 'buyer__last_name']

    def get_serializer_class(self):
        from apps.sales.serializers import SaleTransactionSerializer
        return SaleTransactionSerializer

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
