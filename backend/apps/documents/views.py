"""Stohil Properties - Documents Views"""
from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from apps.documents.models import Document, ComplianceRecord
from utils.permissions import user_modules
from utils.private_media import private_file_response


def can_see_confidential(user, document):
    return user.is_superuser or 'documents' in user_modules(user) or document.created_by_id == user.pk


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.select_related('category')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'category', 'is_confidential']
    search_fields = ['title', 'reference', 'tags']
    ordering_fields = ['title', 'updated_at', 'file_size']
    def get_serializer_class(self):
        from apps.documents.serializers import DocumentSerializer
        return DocumentSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user
        if user.is_superuser or 'documents' in user_modules(user):
            return qs
        # Other modules see non-confidential documents plus their own uploads.
        from django.db.models import Q
        return qs.filter(Q(is_confidential=False) | Q(created_by=user))

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        document = self.get_object()
        if document.is_confidential and not can_see_confidential(request.user, document):
            raise PermissionDenied('This document is confidential.')
        return private_file_response(document.file)

class ComplianceRecordViewSet(viewsets.ModelViewSet):
    queryset = ComplianceRecord.objects.select_related('requirement')
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'requirement']
    def get_serializer_class(self):
        from apps.documents.serializers import ComplianceRecordSerializer
        return ComplianceRecordSerializer
