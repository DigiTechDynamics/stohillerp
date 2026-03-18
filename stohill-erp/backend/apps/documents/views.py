"""Stohil Properties - Documents Views"""
from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from apps.documents.models import Document, ComplianceRecord

class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.select_related('category')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'category', 'is_confidential']
    search_fields = ['title', 'reference', 'tags']
    ordering_fields = ['title', 'updated_at', 'file_size']
    def get_serializer_class(self):
        from apps.documents.serializers import DocumentSerializer
        return DocumentSerializer

class ComplianceRecordViewSet(viewsets.ModelViewSet):
    queryset = ComplianceRecord.objects.select_related('requirement')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'requirement']
    def get_serializer_class(self):
        from apps.documents.serializers import ComplianceRecordSerializer
        return ComplianceRecordSerializer
