"""Stohil Properties - Commission Serializers"""
from rest_framework import serializers  # type: ignore
from apps.commissions.models import CommissionRecord, CommissionStructure, CommissionTier  # type: ignore

class CommissionTierSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommissionTier
        fields = ['id', 'threshold_amount', 'rate_percentage']

class CommissionStructureSerializer(serializers.ModelSerializer):
    tiers = CommissionTierSerializer(many=True, required=False)  # type: ignore

    class Meta:
        model = CommissionStructure
        fields = ['id', 'name', 'calculation_type', 'base_rate', 'is_default', 'tiers', 'created_at']

    def create(self, validated_data):
        tiers_data = validated_data.pop('tiers', [])
        structure = CommissionStructure.objects.create(**validated_data)
        for tier_data in tiers_data:
            CommissionTier.objects.create(structure=structure, **tier_data)
        return structure

    def update(self, instance, validated_data):
        tiers_data = validated_data.pop('tiers', None)
        instance = super().update(instance, validated_data)
        if tiers_data is not None:
            instance.tiers.all().delete()
            for tier_data in tiers_data:
                CommissionTier.objects.create(structure=instance, **tier_data)
        return instance

class CommissionRecordSerializer(serializers.ModelSerializer):
    agent_name = serializers.CharField(source='agent.full_name', read_only=True)
    property_ref = serializers.SerializerMethodField()
    currency_code = serializers.SerializerMethodField()

    class Meta:
        model = CommissionRecord
        fields = '__all__'

    def get_property_ref(self, obj):
        return obj.property.reference_number if obj.property else None

    def get_currency_code(self, obj):
        if obj.property and obj.property.currency:
            return obj.property.currency.code
        from apps.finance.services.fx import currency_code
        return currency_code(None)  # the company's base currency
