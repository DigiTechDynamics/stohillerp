"""Stohil Properties - Commission Serializers"""
from rest_framework import serializers
from apps.commissions.models import CommissionRecord, CommissionStructure

class CommissionStructureSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommissionStructure
        fields = '__all__'

class CommissionRecordSerializer(serializers.ModelSerializer):
    agent_name = serializers.CharField(source='agent.full_name', read_only=True)
    property_ref = serializers.CharField(source='property.reference_number', read_only=True)
    currency_code = serializers.CharField(source='property.currency.code', read_only=True, default='USD')
    class Meta:
        model = CommissionRecord
        fields = '__all__'
