from rest_framework import serializers
from .models import AssetCategory, FixedAsset, AssetBook, AssetLocation, AssetTransaction

class AssetCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetCategory
        fields = '__all__'

class AssetBookSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetBook
        fields = '__all__'

class FixedAssetSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    currency_code = serializers.ReadOnlyField(source='currency.code')
    books = AssetBookSerializer(many=True, read_only=True)
    
    class Meta:
        model = FixedAsset
        fields = '__all__'

class AssetLocationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetLocation
        fields = '__all__'

class AssetTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetTransaction
        fields = '__all__'
