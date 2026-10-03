"""Stohil Properties - Properties serializers"""
from datetime import date
from decimal import Decimal, InvalidOperation

from rest_framework import serializers  # type: ignore

from apps.properties.models import (  # type: ignore
    CustomFieldDefinition, InspectionItem, Portfolio, Property, PropertyImage, PropertyInspection, PropertyOwnership,
    PropertyType, PropertyUnit, PropertyValuation,
)


def validate_custom_fields(entity, values):
    """
    Check custom field values against the active definitions for `entity`:
    unknown keys are refused, required ones must be present, and values are
    normalised to the field type. Returns the cleaned dict.
    """
    if values in (None, ''):
        values = {}
    if not isinstance(values, dict):
        raise serializers.ValidationError('Custom fields must be an object of key: value.')
    defs = {d.key: d for d in CustomFieldDefinition.objects.filter(entity=entity, is_active=True)}
    unknown = set(values) - set(defs)
    if unknown:
        raise serializers.ValidationError(f'Unknown custom field(s): {", ".join(sorted(unknown))}.')
    cleaned, errors = {}, {}
    for key, d in defs.items():
        value = values.get(key)
        if value in (None, ''):
            if d.required:
                errors[key] = f'{d.label} is required.'
            continue
        try:
            if d.field_type == d.FieldType.NUMBER:
                value = str(Decimal(str(value)))
            elif d.field_type == d.FieldType.DATE:
                value = date.fromisoformat(str(value)).isoformat()
            elif d.field_type == d.FieldType.BOOLEAN:
                value = value in (True, 'true', 'True', '1', 1, 'yes')
            elif d.field_type == d.FieldType.CHOICE and value not in (d.choices or []):
                errors[key] = f'{d.label} must be one of: {", ".join(map(str, d.choices or []))}.'
                continue
            else:
                value = str(value)
        except (InvalidOperation, ValueError):
            errors[key] = f'{d.label} is not a valid {d.get_field_type_display().lower()}.'
            continue
        cleaned[key] = value
    if errors:
        raise serializers.ValidationError(errors)
    return cleaned


class CustomFieldsMixin:
    """Validates `custom_fields` against the definitions for `custom_field_entity`."""
    custom_field_entity = None

    def validate_custom_fields(self, value):
        return validate_custom_fields(self.custom_field_entity, value)


class PropertyTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PropertyType
        fields = ['id', 'name', 'code']


class PropertyImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PropertyImage
        fields = ['id', 'property', 'image', 'caption', 'category', 'is_primary', 'sort_order', 'created_at']
        read_only_fields = ['created_at']


class PropertyUnitSerializer(CustomFieldsMixin, serializers.ModelSerializer):
    custom_field_entity = 'unit'
    property_name = serializers.CharField(source='property.name', read_only=True)
    property_ref = serializers.CharField(source='property.reference_number', read_only=True)
    current_lease = serializers.SerializerMethodField()

    class Meta:
        model = PropertyUnit
        fields = ['id', 'property', 'property_name', 'property_ref', 'unit_number', 'unit_type', 'floor', 'status',
                  'floor_size', 'bedrooms', 'bathrooms', 'monthly_rental', 'notes', 'custom_fields', 'current_lease']

    def get_current_lease(self, obj):
        lease = obj.lease_set.filter(status='active').select_related('tenant').first()
        if not lease:
            return None
        return {'id': str(lease.id), 'lease_number': lease.lease_number,
                'tenant': lease.tenant.full_name if lease.tenant else None,
                'monthly_rental': str(lease.monthly_rental), 'end_date': lease.end_date}


class PropertyValuationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PropertyValuation
        fields = ['id', 'property', 'valuation_date', 'valuation_amount', 'valuator_name', 'valuator_company',
                  'method', 'report_reference', 'notes', 'created_at']
        read_only_fields = ['created_at']

    def validate_valuation_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('The valuation must be greater than zero.')
        return value


class InspectionItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InspectionItem
        fields = ['id', 'inspection', 'area', 'item', 'condition', 'notes', 'photo', 'repair_cost', 'sort_order']

    def validate_repair_cost(self, value):
        if value < 0:
            raise serializers.ValidationError('Repair cost cannot be negative.')
        return value


class PropertyInspectionSerializer(serializers.ModelSerializer):
    items = InspectionItemSerializer(many=True, read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    unit_number = serializers.CharField(source='unit.unit_number', read_only=True, default=None)
    inspector_name = serializers.CharField(source='inspector.full_name', read_only=True, default=None)
    lease_number = serializers.CharField(source='lease.lease_number', read_only=True, default=None)
    damage_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = PropertyInspection
        fields = ['id', 'property', 'property_name', 'unit', 'unit_number', 'lease', 'lease_number',
                  'inspection_type', 'status', 'scheduled_date', 'completed_date', 'inspector', 'inspector_name',
                  'condition_rating', 'findings', 'action_required', 'report_document', 'damage_total', 'items']
        read_only_fields = ['completed_date']

    def validate(self, attrs):
        prop, unit = attrs.get('property', getattr(self.instance, 'property', None)), attrs.get('unit')
        if unit and prop and unit.property_id != prop.pk:
            raise serializers.ValidationError({'unit': 'The unit belongs to a different property.'})
        rating = attrs.get('condition_rating')
        if rating is not None and not 1 <= rating <= 10:
            raise serializers.ValidationError({'condition_rating': 'Rate the condition from 1 to 10.'})
        return attrs


class PortfolioSerializer(serializers.ModelSerializer):
    property_count = serializers.IntegerField(source='properties.count', read_only=True)

    class Meta:
        model = Portfolio
        fields = ['id', 'name', 'description', 'property_count']


class PropertyOwnershipSerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source='owner.full_name', read_only=True)

    class Meta:
        model = PropertyOwnership
        fields = ['id', 'property', 'owner', 'owner_name', 'share_percent']

    def validate(self, attrs):
        share = attrs.get('share_percent', getattr(self.instance, 'share_percent', None))
        prop = attrs.get('property', getattr(self.instance, 'property', None))
        if share is None or share <= 0 or share > 100:
            raise serializers.ValidationError({'share_percent': 'A share must be above 0 and at most 100%.'})
        others = PropertyOwnership.objects.filter(property=prop)
        if self.instance:
            others = others.exclude(pk=self.instance.pk)
        total = sum((o.share_percent for o in others), Decimal('0')) + share
        if total > 100:
            raise serializers.ValidationError(
                {'share_percent': f'Shares for this property would total {total}%; they cannot exceed 100%.'})
        return attrs


class CustomFieldDefinitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomFieldDefinition
        fields = ['id', 'entity', 'key', 'label', 'field_type', 'choices', 'required', 'sort_order', 'is_active']

    def validate(self, attrs):
        field_type = attrs.get('field_type', getattr(self.instance, 'field_type', None))
        choices = attrs.get('choices', getattr(self.instance, 'choices', []))
        if field_type == CustomFieldDefinition.FieldType.CHOICE and not choices:
            raise serializers.ValidationError({'choices': 'Give the options for a choice field.'})
        return attrs


class PropertyListSerializer(serializers.ModelSerializer):
    property_type_name = serializers.CharField(source='property_type.name', read_only=True)
    primary_image = serializers.SerializerMethodField()
    full_address = serializers.ReadOnlyField()
    currency_code = serializers.CharField(source='currency.code', read_only=True, default=None)
    portfolio_name = serializers.CharField(source='portfolio.name', read_only=True, default=None)
    unit_count = serializers.IntegerField(source='units.count', read_only=True)

    class Meta:
        model = Property
        fields = ['id', 'reference_number', 'name', 'property_type_name', 'status',
                  'ownership_type', 'suburb', 'city', 'asking_price', 'rental_rate',
                  'current_valuation', 'bedrooms', 'bathrooms', 'floor_size',
                  'latitude', 'longitude', 'full_address', 'primary_image', 'currency_code',
                  'portfolio', 'portfolio_name', 'unit_count']

    def get_primary_image(self, obj):
        images = list(obj.images.all())          # prefetched by the list view
        img = next((i for i in images if i.is_primary), None) or (images[0] if images else None)
        if img:
            request = self.context.get('request')
            return request.build_absolute_uri(img.image.url) if request else img.image.url
        return None


class PropertyDetailSerializer(CustomFieldsMixin, serializers.ModelSerializer):
    custom_field_entity = 'property'
    property_type = PropertyTypeSerializer(read_only=True)  # type: ignore
    property_type_id = serializers.PrimaryKeyRelatedField(
        queryset=PropertyType.objects.all(), source='property_type', write_only=True
    )
    images = PropertyImageSerializer(many=True, read_only=True)  # type: ignore
    units = PropertyUnitSerializer(many=True, read_only=True)  # type: ignore
    ownerships = PropertyOwnershipSerializer(many=True, read_only=True)  # type: ignore
    full_address = serializers.ReadOnlyField()
    currency_code = serializers.CharField(source='currency.code', read_only=True, default=None)
    portfolio_name = serializers.CharField(source='portfolio.name', read_only=True, default=None)

    class Meta:
        model = Property
        fields = '__all__'
