"""Stohil Properties - Sales Serializers"""
from rest_framework import serializers
from apps.sales.models import SaleTransaction

class SaleTransactionSerializer(serializers.ModelSerializer):
    buyer_name = serializers.CharField(source='buyer.full_name', read_only=True)
    seller_name = serializers.CharField(source='seller.full_name', read_only=True, allow_null=True)
    property_ref = serializers.CharField(source='property.reference_number', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    currency_code = serializers.CharField(source='currency.code', read_only=True, default='USD')
    listing_agent_name = serializers.CharField(source='listing_agent.full_name', read_only=True, allow_null=True)
    selling_agent_name = serializers.CharField(source='selling_agent.full_name', read_only=True, allow_null=True)
    closing_date = serializers.DateField(source='transfer_date', read_only=True)
    journal_entry_ref = serializers.CharField(source='journal_entry.reference', read_only=True, allow_null=True)
    
    # Extract invoice ID from journal source if posted
    related_invoice_id = serializers.SerializerMethodField()

    def get_related_invoice_id(self, obj):
        if obj.journal_entry and obj.journal_entry.source_module == 'ar':
            return obj.journal_entry.source_id
        return None
        
    related_commission_id = serializers.SerializerMethodField()
    
    def get_related_commission_id(self, obj):
        from apps.commissions.models import CommissionRecord
        comm = CommissionRecord.objects.filter(sale_transaction=obj).first()
        return comm.id if comm else None

    class Meta:
        model = SaleTransaction
        fields = '__all__'
