"""Stohil Properties - Sales Views"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
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
            return Response({'status': 'posted', 'journal_reference': entry.reference})
        except Exception as e:
            return Response({'error': str(e)}, status=400)
