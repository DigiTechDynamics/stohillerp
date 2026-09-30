"""
Development projects.

  CRUD projects/                       (creating one also creates its cost centre)
  GET  projects/{id}/cost_report/      cost to date by account, budget, WIP, open PO commitments
  POST projects/{id}/capitalise/       {"date"?, "amount"?, "target"?, "asset_category"?, "useful_life_months"?}
"""

from datetime import date

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.projects import services
from apps.projects.models import Project


class ProjectSerializer(serializers.ModelSerializer):
    property_name = serializers.CharField(source='property.name', read_only=True, default=None)
    cost_center_code = serializers.CharField(source='cost_center.code', read_only=True)
    wip_account_code = serializers.CharField(source='wip_account.code', read_only=True)
    wip_balance = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = ['id', 'code', 'name', 'property', 'property_name', 'status', 'start_date', 'end_date', 'budget',
                  'capitalise_to', 'notes', 'cost_center', 'cost_center_code', 'wip_account', 'wip_account_code',
                  'wip_balance']
        read_only_fields = ['cost_center', 'wip_account']

    def get_wip_balance(self, obj):
        return str(services.wip_balance(obj))

    def create(self, validated_data):
        return services.create_project(**validated_data)


class ProjectViewSet(viewsets.ModelViewSet):
    queryset = Project.objects.select_related('property', 'cost_center', 'wip_account')
    serializer_class = ProjectSerializer
    filterset_fields = ['status', 'property']
    search_fields = ['code', 'name']

    @action(detail=True, methods=['get'])
    def cost_report(self, request, pk=None):
        return Response(services.cost_report(self.get_object()))

    @action(detail=True, methods=['post'])
    def capitalise(self, request, pk=None):
        from apps.fixed_assets.models import AssetCategory

        try:
            on = date.fromisoformat(request.data['date']) if request.data.get('date') else timezone.localdate()
        except ValueError:
            raise ValidationError({'date': 'Use YYYY-MM-DD.'})
        category = get_object_or_404(AssetCategory, pk=request.data['asset_category']) \
            if request.data.get('asset_category') else None
        life = request.data.get('useful_life_months')
        record = services.capitalise(
            self.get_object(), on, request.data.get('amount') or None, request.data.get('target') or None,
            category, int(life) if life else None, request.user)
        return Response({'journal_entry': record.journal_entry.reference, 'amount': str(record.amount),
                         'target': record.target,
                         'fixed_asset': record.fixed_asset.code if record.fixed_asset else None},
                        status=status.HTTP_201_CREATED)
