"""Stohil Properties - Documents Serializers"""
from rest_framework import serializers
from apps.documents.models import Document, ComplianceRecord, DocumentCategory, DocumentWorkspace, DocumentTag

class DocumentCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentCategory
        fields = '__all__'


class DocumentWorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = DocumentWorkspace
        fields = '__all__'

class DocumentTagSerializer(serializers.ModelSerializer):
    workspace_name = serializers.CharField(source='workspace.name', read_only=True)
    class Meta:
        model = DocumentTag
        fields = '__all__'

class DocumentSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    workspace_name = serializers.CharField(source='workspace.name', read_only=True)
    tags_detail = DocumentTagSerializer(source='tags', many=True, read_only=True)
    
    category = serializers.PrimaryKeyRelatedField(queryset=DocumentCategory.objects.all(), required=False, allow_null=True)
    workspace = serializers.PrimaryKeyRelatedField(queryset=DocumentWorkspace.objects.all(), required=False, allow_null=True)

    class Meta:
        model = Document
        fields = '__all__'
        read_only_fields = ['reference', 'file_size', 'mime_type', 'version', 'thumbnail', 'created_by', 'updated_by']

    def to_internal_value(self, data):
        # Support resolving category by string code
        if 'category' in data and isinstance(data['category'], str) and len(data['category']) > 2:
            try:
                # If it's a valid UUID, let the default logic handle it
                from uuid import UUID
                UUID(data['category'])
            except ValueError:
                # Not a UUID, try to resolve by code
                cat = DocumentCategory.objects.filter(code=data['category']).first()
                if cat:
                    # Replace code with PK for standard validation
                    data = data.copy()
                    data['category'] = cat.pk
        
        return super().to_internal_value(data)

    def validate_workspace(self, value):
        if value and not value.is_active:
            raise serializers.ValidationError("Cannot assign documents to an inactive workspace.")
        return value

class ComplianceRecordSerializer(serializers.ModelSerializer):
    requirement_name = serializers.CharField(source='requirement.name', read_only=True)
    class Meta:
        model = ComplianceRecord
        fields = '__all__'
