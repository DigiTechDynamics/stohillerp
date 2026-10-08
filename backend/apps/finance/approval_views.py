"""
Approval endpoints for AP documents, and approval rule setup.

  GET  supplier-invoices/{id}/approval_status/   (same on supplier-payments)
  POST supplier-invoices/{id}/approve/            {"comment"?}
  POST supplier-invoices/{id}/reject/             {"comment"}
  CRUD approval-rules/
"""

from rest_framework import serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.finance.models import ApprovalRule
from apps.finance.services import approvals


def _clean(state):
    for step in state['steps']:
        step['rule_id'] = str(step['rule_id'])
    return state


class ApprovalActions:
    def perform_create(self, serializer):
        # The creator is recorded so they can't approve their own document.
        doc = serializer.save(created_by=self.request.user)
        approvals.notify_progress(doc)

    @action(detail=True, methods=['get'])
    def approval_status(self, request, pk=None):
        return Response(_clean(approvals.status(self.get_object())))

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        doc = self.get_object()
        state = approvals.approve(doc, request.user, request.data.get('comment', ''))
        approvals.notify_progress(doc)
        return Response(_clean(state))

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        doc = self.get_object()
        comment = request.data.get('comment', '')
        state = approvals.reject(doc, request.user, comment)
        approvals.notify_progress(doc, rejected_by=request.user, comment=comment)
        return Response(_clean(state))


class ApprovalRuleSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source='role.name', read_only=True)

    class Meta:
        model = ApprovalRule
        fields = ['id', 'name', 'document_type', 'min_amount', 'role', 'role_name', 'sequence', 'is_active']


class ApprovalRuleViewSet(viewsets.ModelViewSet):
    queryset = ApprovalRule.objects.select_related('role')
    serializer_class = ApprovalRuleSerializer
    filterset_fields = ['document_type', 'is_active']
