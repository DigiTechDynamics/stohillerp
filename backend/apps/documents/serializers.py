"""Stohil Properties - Documents Serializers"""
from django.conf import settings
from rest_framework import serializers

from apps.documents.models import ComplianceRecord, Document, DocumentCategory


class DocumentCategorySerializer(serializers.ModelSerializer):
    # Annotated by the view: documents of this type the caller can see.
    document_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = DocumentCategory
        fields = ['id', 'name', 'code', 'description', 'retention_years', 'sort_order', 'is_active', 'document_count']


class DocumentSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.full_name', read_only=True, default=None)
    property_name = serializers.CharField(source='property.name', read_only=True, default=None)
    contact_name = serializers.CharField(source='contact.full_name', read_only=True, default=None)
    lease_number = serializers.CharField(source='lease.lease_number', read_only=True, default=None)
    employee_name = serializers.CharField(source='employee.full_name', read_only=True, default=None)
    # Files are private: clients download through the authenticated action,
    # never a public /media/ URL.
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = Document
        fields = '__all__'
        read_only_fields = ['reference', 'file_size', 'mime_type', 'version']
        extra_kwargs = {'file': {'write_only': True}}

    def get_download_url(self, obj):
        return f'/api/v1/documents/{obj.pk}/download/' if obj.file else None

    def validate_file(self, file):
        limit = getattr(settings, 'DATA_UPLOAD_MAX_MEMORY_SIZE', 10 * 1024 * 1024)
        if file and file.size > limit:
            raise serializers.ValidationError(f'The file is larger than the {limit // (1024 * 1024)} MB limit.')
        return file


class ComplianceRecordSerializer(serializers.ModelSerializer):
    requirement_name = serializers.CharField(source='requirement.name', read_only=True)
    class Meta:
        model = ComplianceRecord
        fields = '__all__'
