"""Stohil Properties - Properties serializers"""
from rest_framework import serializers  # type: ignore
from utils.serializers import SanitizedModelSerializer
from apps.properties.models import Property, PropertyUnit, PropertyImage, PropertyValuation, PropertyInspection, PropertyType  # type: ignore


class PropertyTypeSerializer(SanitizedModelSerializer):
    class Meta:
        model = PropertyType
        fields = ['id', 'name', 'code']


class PropertyImageSerializer(SanitizedModelSerializer):
    class Meta:
        model = PropertyImage
        fields = ['id', 'image', 'caption', 'category', 'is_primary', 'sort_order']


class PropertyUnitSerializer(SanitizedModelSerializer):
    class Meta:
        model = PropertyUnit
        fields = ['id', 'unit_number', 'floor', 'status', 'floor_size', 'bedrooms', 'bathrooms', 'monthly_rental']


class PropertyListSerializer(SanitizedModelSerializer):
    property_type_name = serializers.CharField(source='property_type.name', read_only=True)
    primary_image = serializers.SerializerMethodField()
    full_address = serializers.ReadOnlyField()
    currency_code = serializers.CharField(source='currency.code', read_only=True, default='USD')

    class Meta:
        model = Property
        fields = ['id', 'reference_number', 'name', 'property_type_name', 'status',
                  'ownership_type', 'suburb', 'city', 'asking_price', 'rental_rate',
                  'current_valuation', 'bedrooms', 'bathrooms', 'floor_size',
                  'latitude', 'longitude', 'full_address', 'primary_image', 'currency_code']

    def get_primary_image(self, obj):
        img = obj.images.filter(is_primary=True).first() or obj.images.first()
        if img:
            request = self.context.get('request')
            return request.build_absolute_uri(img.image.url) if request else img.image.url
        return None


class PropertyDetailSerializer(SanitizedModelSerializer):
    property_type = PropertyTypeSerializer(read_only=True)  # type: ignore
    property_type_id = serializers.PrimaryKeyRelatedField(
        queryset=PropertyType.objects.all(), source='property_type', write_only=True
    )
    images = PropertyImageSerializer(many=True, read_only=True)  # type: ignore
    units = PropertyUnitSerializer(many=True, read_only=True)  # type: ignore
    full_address = serializers.ReadOnlyField()
    currency_code = serializers.CharField(source='currency.code', read_only=True, default='USD')

    class Meta:
        model = Property
        fields = '__all__'
