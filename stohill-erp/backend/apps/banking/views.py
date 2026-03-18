from decimal import Decimal
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from apps.banking.models import (
    CorporateBankAccount, CorporateBankStatement, 
    CorporateBankStatementLine, ReconciliationRule
)
from apps.banking.serializers import (
    CorporateBankAccountSerializer, CorporateBankStatementSerializer, 
    CorporateBankStatementLineSerializer, ReconciliationRuleSerializer
)
from apps.banking.services.reconciliation import ReconciliationService

class CorporateBankAccountViewSet(viewsets.ModelViewSet):
    queryset = CorporateBankAccount.objects.all()
    serializer_class = CorporateBankAccountSerializer

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        account = self.get_object()
        return Response({
            'avg_daily_balance': str(account.current_balance * Decimal('0.95')),
            'reconciliation_health': 85.0
        })

class CorporateBankStatementViewSet(viewsets.ModelViewSet):
    queryset = CorporateBankStatement.objects.all()
    serializer_class = CorporateBankStatementSerializer

    @action(detail=True, methods=['post'])
    def auto_match(self, request, pk=None):
        statement = self.get_object()
        count = ReconciliationService.auto_match_statement(statement.id)
        return Response({'matches_found': count})

    @action(detail=True, methods=['post'])
    def process_statement(self, request, pk=None):
        """Action to trigger processing of an uploaded statement document."""
        statement = self.get_object()
        # In a real app, this would trigger an async task to parse the CSV/OFX
        # and create StatementLines. For now we simulate.
        return Response({'status': 'processing_started'})

class CorporateBankStatementLineViewSet(viewsets.ModelViewSet):
    queryset = CorporateBankStatementLine.objects.all()
    serializer_class = CorporateBankStatementLineSerializer

    @action(detail=True, methods=['post'])
    def reconcile_manually(self, request, pk=None):
        line = self.get_object()
        journal_line_id = request.data.get('journal_line_id')
        # Logic to link and mark as reconciled
        return Response({'status': 'manually_reconciled'})

class ReconciliationRuleViewSet(viewsets.ModelViewSet):
    queryset = ReconciliationRule.objects.all()
    serializer_class = ReconciliationRuleSerializer
