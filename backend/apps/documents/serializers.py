"""Stohil Properties - Documents Serializers"""
from rest_framework import serializers
from apps.documents.models import Document, ComplianceRecord

class DocumentSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    # Files are private: clients download through the authenticated action,
    # never a public /media/ URL.
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = '__all__'
        extra_kwargs = {'file': {'write_only': True}}

    def get_download_url(self, obj):
        return f'/api/v1/documents/{obj.pk}/download/' if obj.file else None

class ComplianceRecordSerializer(serializers.ModelSerializer):
    requirement_name = serializers.CharField(source='requirement.name', read_only=True)
    class Meta:
        model = ComplianceRecord
        fields = '__all__'
