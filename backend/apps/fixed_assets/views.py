from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, status, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from .models import AssetCategory, FixedAsset, AssetBook, AssetLocation, AssetTransaction
from .serializers import (
    AssetCategorySerializer, FixedAssetSerializer, AssetBookSerializer,
    AssetLocationSerializer, AssetTransactionSerializer
)
from .services.depreciation import DepreciationService
from utils.record_rules import RecordRulesMixin

class AssetCategoryViewSet(viewsets.ModelViewSet):
    queryset = AssetCategory.objects.select_related(
        'asset_cost_account', 'accum_depr_account', 'depr_expense_account', 'disposal_gain_loss_account').order_by('code')
    serializer_class = AssetCategorySerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'code']

class FixedAssetViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = FixedAsset.objects.all().prefetch_related('books')
    serializer_class = FixedAssetSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'status']
    search_fields = ['name', 'code', 'serial_number']
    ordering_fields = ['acquisition_date', 'acquisition_cost']

    @action(detail=False, methods=['post'], url_path='run-depreciation')
    def run_depreciation(self, request):
        """Action to trigger the depreciation run for all active assets."""
        asset_ids = request.data.get('asset_ids')
        end_date = request.data.get('end_date')
        units_data = request.data.get('units_data')
        
        service = DepreciationService(user=request.user)
        try:
            results = service.run_depreciation_for_period(
                asset_ids=asset_ids, 
                end_date=end_date,
                units_data=units_data
            )
            return Response({
                'message': f'Depreciation run completed. {len(results)} assets processed.',
                'results': results
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=True, methods=['post'], url_path='dispose')
    def dispose(self, request, pk=None):
        """Action to dispose of an asset."""
        asset = self.get_object()
        disposal_date = request.data.get('disposal_date')
        # Previously crashed with NameError: Decimal was never imported.
        try:
            net_proceeds = Decimal(str(request.data.get('net_proceeds', '0.00')))
        except (InvalidOperation, ValueError):
            return Response({'error': 'net_proceeds must be a number'}, status=status.HTTP_400_BAD_REQUEST)
        if net_proceeds < 0:
            return Response({'error': 'net_proceeds cannot be negative'}, status=status.HTTP_400_BAD_REQUEST)
        notes = request.data.get('notes', '')
        
        if not disposal_date:
            return Response({'error': 'disposal_date is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        service = DepreciationService(user=request.user)
        try:
            result = service.post_asset_disposal(
                asset_id=asset.id,
                disposal_date=disposal_date,
                net_proceeds=net_proceeds,
                notes=notes
            )
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

class AssetBookViewSet(viewsets.ModelViewSet):
    queryset = AssetBook.objects.select_related('asset').order_by('asset__code', 'book_type')
    serializer_class = AssetBookSerializer
    filterset_fields = ['asset', 'book_type']

    def perform_destroy(self, instance):
        if instance.accumulated_depreciation or instance.last_depreciation_date:
            from rest_framework.exceptions import ValidationError
            raise ValidationError('This book has been depreciated and cannot be deleted.')
        instance.delete()


class AssetLocationViewSet(viewsets.ModelViewSet):
    """Where an asset is, as a dated history of transfers (the latest is the current location)."""
    queryset = AssetLocation.objects.select_related('asset').order_by('-transfer_date', '-created_at')
    serializer_class = AssetLocationSerializer
    filterset_fields = ['asset']


class AssetTransactionViewSet(viewsets.ReadOnlyModelViewSet):
    """Asset history: acquisitions, depreciation, revaluations and disposals (?asset=&transaction_type=)."""
    queryset = AssetTransaction.objects.select_related('asset', 'journal_entry')
    serializer_class = AssetTransactionSerializer
    filterset_fields = ['asset', 'transaction_type', 'asset__category']
    search_fields = ['asset__code', 'asset__name', 'notes']
