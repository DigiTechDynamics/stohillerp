"""Stohil Properties - Documents Views"""
from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count, Q

from apps.documents.models import ComplianceRecord, Document, DocumentCategory
from utils.permissions import user_modules
from utils.private_media import private_file_response


# A compliant record expiring within this many days is flagged as expiring.
EXPIRING_DAYS = 30


def can_see_confidential(user, document):
    return user.is_superuser or 'documents' in user_modules(user) or document.created_by_id == user.pk


def visible_documents(user, qs=None):
    """Documents the user may see: all for the Documents module, else non-confidential plus their own."""
    qs = Document.objects.all() if qs is None else qs
    if user.is_superuser or 'documents' in user_modules(user):
        return qs
    return qs.filter(Q(is_confidential=False) | Q(created_by=user))


class DocumentCategoryViewSet(viewsets.ModelViewSet):
    """Document types, each with the number of documents of that type the caller can see."""
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['is_active']
    pagination_class = None

    def get_serializer_class(self):
        from apps.documents.serializers import DocumentCategorySerializer
        return DocumentCategorySerializer

    def get_queryset(self):
        visible = visible_documents(self.request.user).values('pk')
        return DocumentCategory.objects.annotate(
            document_count=Count('document', filter=Q(document__in=visible), distinct=True)
        ).order_by('sort_order', 'name')   # Meta.ordering is dropped on aggregate queries


class DocumentViewSet(viewsets.ModelViewSet):
    queryset = Document.objects.select_related('category', 'created_by', 'property', 'contact', 'lease', 'employee')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'category', 'is_confidential', 'property', 'contact', 'lease', 'employee']
    search_fields = ['title', 'reference', 'description']
    ordering_fields = ['title', 'updated_at', 'file_size']
    def get_serializer_class(self):
        from apps.documents.serializers import DocumentSerializer
        return DocumentSerializer

    def get_queryset(self):
        # Other modules see non-confidential documents plus their own uploads.
        return visible_documents(self.request.user, super().get_queryset())

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

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """
        Compliance score per requirement and overall, from the records.
        Expiry dates are applied as of today: a record past its expiry counts
        as expired, and one expiring within EXPIRING_DAYS as expiring, whatever
        its stored status. Score = records currently valid / records that
        apply (exempt records are left out).
        """
        from collections import defaultdict
        from datetime import timedelta

        from django.utils import timezone
        from rest_framework.response import Response

        S = ComplianceRecord.ComplianceStatus
        today = timezone.localdate()
        soon = today + timedelta(days=EXPIRING_DAYS)

        def effective(rec):
            if rec.status == S.EXEMPT:
                return S.EXEMPT
            if rec.expiry_date and rec.expiry_date < today:
                return S.EXPIRED
            if rec.status == S.COMPLIANT and rec.expiry_date and rec.expiry_date <= soon:
                return S.EXPIRING_SOON
            return rec.status

        valid = {S.COMPLIANT, S.EXPIRING_SOON}
        per_req = defaultdict(lambda: defaultdict(int))
        names, attention = {}, []
        records = self.get_queryset().select_related('requirement', 'contact', 'employee')
        for rec in records:
            state = effective(rec)
            per_req[rec.requirement_id][state] += 1
            per_req[rec.requirement_id]['last_updated'] = max(per_req[rec.requirement_id]['last_updated'] or rec.updated_at,
                                                              rec.updated_at)
            names[rec.requirement_id] = rec.requirement.name
            if state not in valid and state != S.EXEMPT:
                party = rec.contact or rec.employee
                attention.append({'requirement': rec.requirement.name, 'status': state,
                                  'party': getattr(party, 'full_name', '') if party else '',
                                  'expiry_date': rec.expiry_date})

        def score(counts):
            applicable = sum(v for k, v in counts.items() if k not in (S.EXEMPT, 'last_updated'))
            return round(sum(counts.get(k, 0) for k in valid) / applicable * 100) if applicable else None

        requirements = []
        totals = defaultdict(int)
        for req_id, counts in per_req.items():
            for k, v in counts.items():
                if k != 'last_updated':
                    totals[k] += v
            requirements.append({
                'requirement': names[req_id], 'score': score(counts),
                'compliant': counts.get(S.COMPLIANT, 0), 'expiring': counts.get(S.EXPIRING_SOON, 0),
                'expired': counts.get(S.EXPIRED, 0), 'non_compliant': counts.get(S.NON_COMPLIANT, 0),
                'pending': counts.get(S.PENDING, 0), 'exempt': counts.get(S.EXEMPT, 0),
                'last_updated': counts['last_updated'],
            })
        requirements.sort(key=lambda r: (r['score'] is None, r['score'] if r['score'] is not None else 0))
        attention.sort(key=lambda a: (a['expiry_date'] is None, a['expiry_date'] or today))
        return Response({
            'overall_score': score(totals), 'record_count': sum(totals.values()),
            'expiring_window_days': EXPIRING_DAYS,
            'requirements': requirements, 'attention': attention[:10],
        })
