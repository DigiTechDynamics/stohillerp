"""Stohil Properties - Documents Serializers"""
from rest_framework import serializers
from apps.documents.models import Document, ComplianceRecord, DocumentCategory

class DocumentSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    class Meta:
        model = Document
        fields = '__all__'

class ComplianceRecordSerializer(serializers.ModelSerializer):
    requirement_name = serializers.CharField(source='requirement.name', read_only=True)
    class Meta:
        model = ComplianceRecord
        fields = '__all__'
