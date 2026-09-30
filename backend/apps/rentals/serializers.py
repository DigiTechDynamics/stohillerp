"""Stohil Properties - Rentals Serializers"""
from rest_framework import serializers
from apps.rentals.models import Lease, RentalInvoice, RentalPayment, MaintenanceRequest


class LeaseSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='tenant.full_name', read_only=True)
    property_ref = serializers.CharField(source='property.reference_number', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    property_address = serializers.SerializerMethodField()
    unit_number = serializers.CharField(source='unit.unit_number', read_only=True, default=None)
    agent_name = serializers.CharField(source='managing_agent.full_name', read_only=True, default=None)
    property_type_name = serializers.CharField(source='property.property_type.name', read_only=True, default=None)
    currency_code = serializers.CharField(source='currency.code', read_only=True, default='USD')

    class Meta:
        model = Lease
        fields = '__all__'
        read_only_fields = ['lease_number']

    def get_property_address(self, obj):
        return obj.property.full_address if obj.property else ''


class RentalInvoiceSerializer(serializers.ModelSerializer):
    tenant_name = serializers.CharField(source='lease.tenant.full_name', read_only=True)
    property_ref = serializers.CharField(source='lease.property.reference_number', read_only=True)
    property_name = serializers.CharField(source='lease.property.name', read_only=True)
    lease_number = serializers.CharField(source='lease.lease_number', read_only=True)
    currency_code = serializers.CharField(source='currency.code', read_only=True, default='USD')

    class Meta:
        model = RentalInvoice
        fields = '__all__'
        read_only_fields = ['invoice_number']


class RentalPaymentSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    tenant_name = serializers.CharField(source='invoice.lease.tenant.full_name', read_only=True)

    class Meta:
        model = RentalPayment
        fields = '__all__'


class MaintenanceRequestSerializer(serializers.ModelSerializer):
    property_ref = serializers.SerializerMethodField()
    property_name = serializers.SerializerMethodField()
    tenant_name = serializers.CharField(source='lease.tenant.full_name', read_only=True, default=None)
    currency_code = serializers.ReadOnlyField(source='currency.code')

    class Meta:
        model = MaintenanceRequest
        fields = '__all__'
        read_only_fields = ['reference']

    def get_property_ref(self, obj):
        if obj.property:
            return obj.property.reference_number
        if obj.lease and obj.lease.property:
            return obj.lease.property.reference_number
        return None

    def get_property_name(self, obj):
        if obj.property:
            return obj.property.name
        if obj.lease and obj.lease.property:
            return obj.lease.property.name
        return None


class LeaseChargeSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True, default=None)

    class Meta:
        from apps.rentals.models import LeaseCharge
        model = LeaseCharge
        fields = ['id', 'lease', 'charge_type', 'description', 'monthly_amount', 'account', 'account_code',
                  'vat_applicable', 'start_date', 'end_date', 'is_active']