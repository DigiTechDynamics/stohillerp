"""Stohil Properties - Documents Views"""
import mimetypes
from rest_framework import viewsets, filters, status, permissions
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Q
from apps.documents.models import Document, ComplianceRecord, DocumentWorkspace, DocumentTag, DocumentCategory, ComplianceRequirement
from apps.documents.serializers import (
    DocumentSerializer, ComplianceRecordSerializer, 
    DocumentWorkspaceSerializer, DocumentTagSerializer,
    DocumentCategorySerializer
)
from apps.core.models import Role

class IsDocumentNotLocked(permissions.BasePermission):
    """Prevent modification of locked documents."""
    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return not obj.is_locked

class DocumentWorkspaceViewSet(viewsets.ModelViewSet):
    queryset = DocumentWorkspace.objects.filter(is_active=True).order_by('name')
    serializer_class = DocumentWorkspaceSerializer
    permission_classes = [IsAuthenticated]

class DocumentCategoryViewSet(viewsets.ModelViewSet):
    queryset = DocumentCategory.objects.all().order_by('name')
    serializer_class = DocumentCategorySerializer
    permission_classes = [IsAuthenticated]

class DocumentTagViewSet(viewsets.ModelViewSet):
    queryset = DocumentTag.objects.all().order_by('name')
    serializer_class = DocumentTagSerializer
    permission_classes = [IsAuthenticated]
    filterset_fields = ['workspace']

class DocumentViewSet(viewsets.ModelViewSet):
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated, IsDocumentNotLocked]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'workspace', 'category', 'is_confidential', 'tags']
    search_fields = ['title', 'reference', 'tags__name']
    ordering_fields = ['title', 'updated_at', 'file_size']

    def get_queryset(self):
        user = self.request.user
        base_qs = Document.objects.select_related('workspace', 'category').prefetch_related('tags')
        
        # Superuser and specific roles can see confidential docs
        if user.is_superuser or user.has_role(Role.RoleType.SUPER_ADMIN) or \
           user.has_role(Role.RoleType.COMPLIANCE_OFFICER) or user.has_role(Role.RoleType.EXECUTIVE):
            return base_qs
            
        # Others only see non-confidential ones
        return base_qs.filter(is_confidential=False)

    def perform_create(self, serializer):
        data = self.request.data
        file_obj = data.get('file')
        file_size = file_obj.size if file_obj else 0
        
        # Mime detection
        mime_type = ''
        if file_obj:
            mime_type = mimetypes.guess_type(file_obj.name)[0] or 'application/octet-stream'

        # Resolve category if string code provided
        category_input = data.get('category')
        category_obj = None
        if category_input:
            # Handle both PK and string code
            if isinstance(category_input, str) and not category_input.isdigit() and len(category_input) > 1:
                category_obj = DocumentCategory.objects.filter(code=category_input).first()
            else:
                try:
                    category_obj = DocumentCategory.objects.get(pk=category_input)
                except (DocumentCategory.DoesNotExist, ValueError):
                    pass

        # Reference generation
        from apps.core.services.number_sequence import NumberSequenceService
        ref = NumberSequenceService.get_next_number("Document", prefix="DOC-", padding=6)

        # Entity Linking Logic
        extra_fields = {
            'created_by': self.request.user,
            'file_size': file_size,
            'mime_type': mime_type,
            'reference': ref
        }
        if category_obj:
            extra_fields['category'] = category_obj

        # Generic mapping from related_object_type/id
        rel_type = data.get('related_object_type')
        rel_id = data.get('related_object_id')
        if rel_type and rel_id:
            mapping = {
                'property': 'property_id',
                'contact': 'contact_id',
                'employee': 'employee_id',
                'sale': 'sale_transaction_id',
                'lease': 'lease_id'
            }
            if rel_type in mapping:
                extra_fields[mapping[rel_type]] = rel_id

        doc = serializer.save(**extra_fields)

        # Compliance Hook
        if doc.category and (doc.contact or doc.employee):
            self._link_to_compliance_records(doc)

    def _link_to_compliance_records(self, doc):
        """
        Scan for ComplianceRequirements that match the document category 
        and link/update the respective ComplianceRecord.
        """
        # Simple mapping: DocumentCategory.code matches Requirement.name (approx)
        mapping_code = doc.category.code.lower()
        
        # Find requirements that apply to this entity type
        entity_type = 'contact' if doc.contact else 'employee'
        target_entity = doc.contact or doc.employee
        
        requirements = ComplianceRequirement.objects.filter(
            applies_to=entity_type,
            regulation__icontains=mapping_code
        ) | ComplianceRequirement.objects.filter(
            applies_to=entity_type,
            name__icontains=mapping_code
        )

        for req in requirements.distinct():
            # Find or create record for this entity + requirement
            record, created = ComplianceRecord.objects.get_or_create(
                requirement=req,
                contact=doc.contact if entity_type == 'contact' else None,
                employee=doc.employee if entity_type == 'employee' else None,
            )
            
            # Update record if it's not already closed/compliant
            if record.status in [ComplianceRecord.ComplianceStatus.PENDING, ComplianceRecord.ComplianceStatus.EXPIRED, ComplianceRecord.ComplianceStatus.NON_COMPLIANT]:
                record.status = ComplianceRecord.ComplianceStatus.COMPLIANT
                record.document = doc
                record.issue_date = doc.created_at.date()
                if req.renewal_period_months:
                    # Native month addition to avoid external dateutil dependency
                    import datetime
                    year = record.issue_date.year + ((record.issue_date.month + req.renewal_period_months - 1) // 12)
                    month = ((record.issue_date.month + req.renewal_period_months - 1) % 12) + 1
                    day = min(record.issue_date.day, [31, 29 if year % 4 == 0 and (year % 100 != 0 or year % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month-1])
                    record.expiry_date = datetime.date(year, month, day)
                record.save()

class ComplianceRecordViewSet(viewsets.ModelViewSet):
    queryset = ComplianceRecord.objects.select_related('requirement')
    serializer_class = ComplianceRecordSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'requirement']
