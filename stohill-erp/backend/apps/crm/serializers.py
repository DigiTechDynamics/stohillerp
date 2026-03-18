"""Stohil Properties - CRM Serializers"""
from rest_framework import serializers
from apps.crm.models import Contact, Opportunity, Pipeline, PipelineStage, Activity


class ContactSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    currency_code = serializers.ReadOnlyField(source='currency.code')
    active_leases = serializers.SerializerMethodField()

    class Meta:
        model = Contact
        fields = '__all__'

    def get_active_leases(self, obj):
        from apps.rentals.models import Lease
        leases = Lease.objects.filter(tenant=obj, status='active').select_related('property')
        return [{
            'id': str(l.id),
            'lease_number': l.lease_number,
            'property_id': str(l.property.id),
            'property_name': l.property.name,
            'property_ref': l.property.reference_number
        } for l in leases]


class PipelineStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PipelineStage
        fields = ['id', 'name', 'stage_type', 'position', 'color', 'probability', 'is_terminal', 'is_won']


class PipelineSerializer(serializers.ModelSerializer):
    stages = PipelineStageSerializer(many=True, read_only=True)

    class Meta:
        model = Pipeline
        fields = ['id', 'name', 'pipeline_type', 'is_default', 'stages']


class OpportunitySerializer(serializers.ModelSerializer):
    contact_name = serializers.CharField(source='contact.full_name', read_only=True)
    property_ref = serializers.CharField(source='property.reference_number', read_only=True)
    stage_name = serializers.CharField(source='stage.name', read_only=True)
    currency_code = serializers.ReadOnlyField(source='currency.code')

    class Meta:
        model = Opportunity
        fields = '__all__'


class ActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = Activity
        fields = '__all__'
