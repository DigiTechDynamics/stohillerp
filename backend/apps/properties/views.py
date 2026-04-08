"""Stohil Properties - Properties Views"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count

from apps.properties.models import Property, PropertyUnit, PropertyType, PropertyInspection
from apps.properties.serializers import (
    PropertyListSerializer, PropertyDetailSerializer,
    PropertyTypeSerializer, PropertyUnitSerializer
)


class PropertyViewSet(viewsets.ModelViewSet):
    queryset = Property.objects.select_related('property_type', 'primary_agent').prefetch_related('images', 'units')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'property_type', 'city', 'suburb', 'ownership_type']
    search_fields = ['reference_number', 'name', 'address_line1', 'suburb', 'city']
    ordering_fields = ['asking_price', 'rental_rate', 'current_valuation', 'created_at', 'name', 'reference_number']

    def get_serializer_class(self):
        if self.action in ['list', 'public']:
            return PropertyListSerializer
        return PropertyDetailSerializer

    @action(detail=False, methods=['get'], permission_classes=[AllowAny])
    def public(self, request):
        """
        Public endpoint for website integration.
        Returns only listed/available properties.
        """
        queryset = self.get_queryset().filter(
            status__in=[
                Property.PropertyStatus.AVAILABLE,
                Property.PropertyStatus.LISTED_FOR_SALE,
                Property.PropertyStatus.LISTED_FOR_RENT
            ]
        )
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def map_data(self, request):
        """Lightweight endpoint for map view - returns coordinates only."""
        qs = self.filter_queryset(self.get_queryset()).filter(
            latitude__isnull=False,
            longitude__isnull=False
        ).values('id', 'reference_number', 'name', 'status', 'latitude', 'longitude',
                 'asking_price', 'rental_rate', 'city', 'suburb')
        return Response(list(qs))

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Property portfolio statistics."""
        from django.db.models import Sum
        stats = Property.objects.aggregate(
            total=Count('id'),
            total_valuation=Sum('current_valuation'),
            total_asking=Sum('asking_price'),
        )
        by_status = {
            item['status']: item['count']
            for item in Property.objects.values('status').annotate(count=Count('id'))
        }
        return Response({**stats, 'by_status': by_status})


class PropertyTypeViewSet(viewsets.ModelViewSet):
    queryset = PropertyType.objects.all()
    serializer_class = PropertyTypeSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
