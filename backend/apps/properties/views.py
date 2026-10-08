"""Stohil Properties - Properties Views"""
from django.db import transaction
from django.db.models import Count, Sum
from django.http import HttpResponse
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.properties.models import (
    CustomFieldDefinition, InspectionItem, Portfolio, Property, PropertyImage, PropertyInspection, PropertyOwnership,
    PropertyType, PropertyUnit, PropertyValuation,
)
from apps.properties.serializers import (
    CustomFieldDefinitionSerializer, InspectionItemSerializer, PortfolioSerializer, PropertyDetailSerializer,
    PropertyImageSerializer, PropertyInspectionSerializer, PropertyListSerializer, PropertyOwnershipSerializer,
    PropertyTypeSerializer, PropertyUnitSerializer, PropertyValuationSerializer,
)


class PropertyViewSet(viewsets.ModelViewSet):
    queryset = Property.objects.select_related('property_type', 'primary_agent', 'portfolio') \
        .prefetch_related('images', 'units')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'property_type', 'city', 'suburb', 'ownership_type', 'portfolio', 'owner']
    search_fields = ['reference_number', 'name', 'address_line1', 'suburb', 'city']
    ordering_fields = ['asking_price', 'rental_rate', 'current_valuation', 'created_at', 'name', 'reference_number']

    def get_serializer_class(self):
        if self.action == 'list':
            return PropertyListSerializer
        return PropertyDetailSerializer

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
    queryset = PropertyType.objects.annotate(property_count=Count('properties')).order_by('name')
    serializer_class = PropertyTypeSerializer
    pagination_class = None


class PropertyUnitViewSet(viewsets.ModelViewSet):
    """Units / lettable spaces within a property."""
    queryset = PropertyUnit.objects.select_related('property')
    serializer_class = PropertyUnitSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['property', 'status', 'unit_type']
    search_fields = ['unit_number', 'property__name', 'property__reference_number']
    ordering_fields = ['unit_number', 'floor', 'floor_size', 'monthly_rental']
    ordering = ['property__reference_number', 'unit_number']


class PropertyImageViewSet(viewsets.ModelViewSet):
    """Photos and floor plans. Upload as multipart: image, property, caption?, category?, is_primary?"""
    queryset = PropertyImage.objects.select_related('property')
    serializer_class = PropertyImageSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['property', 'category', 'is_primary']

    def _only_primary(self, image):
        if image.is_primary:
            PropertyImage.objects.filter(property=image.property).exclude(pk=image.pk).update(is_primary=False)

    def perform_create(self, serializer):
        image = serializer.save()
        if not PropertyImage.objects.filter(property=image.property).exclude(pk=image.pk).exists():
            image.is_primary = True       # the first photo becomes the cover
            image.save(update_fields=['is_primary'])
        self._only_primary(image)

    def perform_update(self, serializer):
        self._only_primary(serializer.save())


class PropertyValuationViewSet(viewsets.ModelViewSet):
    """Valuation history. The latest valuation becomes the property's current valuation."""
    queryset = PropertyValuation.objects.select_related('property')
    serializer_class = PropertyValuationSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['property']
    ordering = ['-valuation_date']

    @staticmethod
    def _refresh_current(prop):
        latest = prop.valuations.order_by('-valuation_date', '-created_at').first()
        prop.current_valuation = latest.valuation_amount if latest else None
        prop.last_valuation_date = latest.valuation_date if latest else None
        prop.save(update_fields=['current_valuation', 'last_valuation_date'])

    def perform_create(self, serializer):
        with transaction.atomic():
            self._refresh_current(serializer.save(created_by=self.request.user).property)

    def perform_update(self, serializer):
        with transaction.atomic():
            self._refresh_current(serializer.save().property)

    def perform_destroy(self, instance):
        prop = instance.property
        with transaction.atomic():
            instance.delete()
            self._refresh_current(prop)


# Default checklist: (area, [items]). Bedrooms/bathrooms repeat per the unit.
BASE_CHECKLIST = [
    ('Entrance', ['Door and locks', 'Walls', 'Floor', 'Lights and switches']),
    ('Lounge', ['Walls', 'Floor', 'Windows', 'Curtains / blinds', 'Lights and switches', 'Plugs']),
    ('Kitchen', ['Walls', 'Floor', 'Cupboards', 'Counter tops', 'Sink and taps', 'Stove / oven', 'Extractor']),
    ('Bedroom', ['Walls', 'Floor', 'Windows', 'Built-in cupboards', 'Lights and switches']),
    ('Bathroom', ['Walls', 'Floor', 'Basin and taps', 'Toilet', 'Bath / shower', 'Mirror']),
    ('Exterior', ['Garden', 'Gate / remote', 'Walls / fence', 'Parking']),
    ('Utilities', ['Electricity meter reading', 'Water meter reading', 'Keys handed over']),
]


def default_checklist(inspection):
    space = inspection.unit or inspection.property
    bedrooms = max(int(getattr(space, 'bedrooms', None) or 1), 1)
    bathrooms = max(int(getattr(space, 'bathrooms', None) or 1), 1)
    rows = []
    for area, items in BASE_CHECKLIST:
        count = bedrooms if area == 'Bedroom' else bathrooms if area == 'Bathroom' else 1
        for n in range(1, count + 1):
            name = f'{area} {n}' if count > 1 else area
            rows.extend((name, item) for item in items)
    return rows


class PropertyInspectionViewSet(viewsets.ModelViewSet):
    """
    Ingoing, outgoing and routine inspections with a checklist.

      POST {id}/checklist/   create the default checklist (if none yet)
      POST {id}/complete/    {"condition_rating"?, "findings"?} mark completed
      GET  {id}/compare/     outgoing vs the lease's ingoing inspection, item by item
      GET  {id}/report/      PDF report
    Repair costs on an outgoing inspection's items are kept from the deposit
    when it is released (rentals/leases/{id}/refund_deposit/).
    """
    queryset = PropertyInspection.objects.select_related('property', 'unit', 'inspector', 'lease') \
        .prefetch_related('items')
    serializer_class = PropertyInspectionSerializer
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['property', 'unit', 'lease', 'inspection_type', 'status']
    ordering = ['-scheduled_date']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def checklist(self, request, pk=None):
        inspection = self.get_object()
        if inspection.items.exists():
            raise ValidationError({'detail': 'This inspection already has a checklist.'})
        InspectionItem.objects.bulk_create([
            InspectionItem(inspection=inspection, area=area, item=item, sort_order=i)
            for i, (area, item) in enumerate(default_checklist(inspection))
        ])
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        inspection = self.get_object()
        if inspection.status == PropertyInspection.InspectionStatus.COMPLETED:
            raise ValidationError({'detail': 'This inspection is already completed.'})
        rating = request.data.get('condition_rating', inspection.condition_rating)
        if rating in (None, ''):
            raise ValidationError({'condition_rating': 'Give an overall condition rating (1-10).'})
        rating = int(rating)
        if not 1 <= rating <= 10:
            raise ValidationError({'condition_rating': 'Rate the condition from 1 to 10.'})
        inspection.condition_rating = rating
        inspection.findings = request.data.get('findings', inspection.findings)
        inspection.action_required = request.data.get('action_required', inspection.action_required)
        inspection.status = PropertyInspection.InspectionStatus.COMPLETED
        inspection.completed_date = timezone.now()
        inspection.save()
        return Response(self.get_serializer(inspection).data)

    @action(detail=True, methods=['get'])
    def compare(self, request, pk=None):
        """Each item's condition at move-in (ingoing) beside its condition now."""
        inspection = self.get_object()
        baseline = PropertyInspection.objects.filter(
            inspection_type=PropertyInspection.InspectionType.INGOING,
            status=PropertyInspection.InspectionStatus.COMPLETED,
            **({'lease': inspection.lease} if inspection.lease_id else
               {'unit': inspection.unit} if inspection.unit_id else {'property': inspection.property}),
        ).exclude(pk=inspection.pk).order_by('-completed_date').first()
        before = {(i.area, i.item): i for i in baseline.items.all()} if baseline else {}
        rows = [{
            'area': i.area, 'item': i.item, 'condition_before': before.get((i.area, i.item)).condition
            if (i.area, i.item) in before else None,
            'condition_now': i.condition, 'repair_cost': str(i.repair_cost), 'notes': i.notes,
        } for i in inspection.items.all()]
        return Response({'baseline_inspection': str(baseline.id) if baseline else None,
                         'baseline_date': baseline.completed_date if baseline else None,
                         'damage_total': str(inspection.damage_total), 'items': rows})

    @action(detail=True, methods=['get'])
    def report(self, request, pk=None):
        from apps.properties.reports_pdf import inspection_pdf
        inspection = self.get_object()
        response = HttpResponse(inspection_pdf(inspection), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="Inspection_{inspection.property.reference_number}.pdf"'
        return response


class InspectionItemViewSet(viewsets.ModelViewSet):
    """Checklist lines; upload a photo as multipart."""
    queryset = InspectionItem.objects.select_related('inspection')
    serializer_class = InspectionItemSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['inspection', 'condition']

    def _check_open(self, inspection):
        if inspection.status == PropertyInspection.InspectionStatus.COMPLETED:
            raise ValidationError({'detail': 'This inspection is completed; its checklist can no longer change.'})

    def perform_create(self, serializer):
        self._check_open(serializer.validated_data['inspection'])
        serializer.save()

    def perform_update(self, serializer):
        self._check_open(serializer.instance.inspection)
        serializer.save()

    def perform_destroy(self, instance):
        self._check_open(instance.inspection)
        instance.delete()


class PortfolioViewSet(viewsets.ModelViewSet):
    queryset = Portfolio.objects.all()
    serializer_class = PortfolioSerializer
    pagination_class = None


class PropertyOwnershipViewSet(viewsets.ModelViewSet):
    """Owner shares of a managed property (multi-owner splits)."""
    queryset = PropertyOwnership.objects.select_related('property', 'owner')
    serializer_class = PropertyOwnershipSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['property', 'owner']


class CustomFieldDefinitionViewSet(viewsets.ModelViewSet):
    queryset = CustomFieldDefinition.objects.all()
    serializer_class = CustomFieldDefinitionSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['entity', 'is_active']
    pagination_class = None
