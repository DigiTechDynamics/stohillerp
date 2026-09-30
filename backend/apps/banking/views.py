"""
Banking: accounts (the unified finance.BankAccount), statements, lines and rules.

  POST statements/import/                  multipart {bank_account, file, reference?, opening_balance?}
  POST statements/{id}/auto_match/
  GET  accounts/{id}/unmatched_ledger/     GL lines not yet matched (signed like statement lines)
  GET  accounts/{id}/reconciliation/       ?as_of= book-to-bank reconciliation
  GET  accounts/{id}/stats/
  POST lines/{id}/reconcile_manually/      {journal_line_id}
  POST lines/{id}/unreconcile/
  POST lines/{id}/post_adjustment/         {account_code, description?}
"""

from datetime import date
from decimal import Decimal, InvalidOperation

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.banking.models import CorporateBankStatement, CorporateBankStatementLine, ReconciliationRule
from apps.banking.serializers import (
    BankAccountSerializer, CorporateBankStatementLineSerializer, CorporateBankStatementSerializer,
    LedgerLineSerializer, ReconciliationRuleSerializer,
)
from apps.banking.services import reconciliation
from apps.finance.models import BankAccount, JournalLine


class BankAccountViewSet(viewsets.ModelViewSet):
    queryset = BankAccount.objects.select_related('gl_account', 'currency')
    serializer_class = BankAccountSerializer
    filterset_fields = ['is_active', 'account_type']
    search_fields = ['code', 'name', 'bank_name', 'account_number']
    ordering_fields = ['code', 'name', 'bank_name']

    @action(detail=True, methods=['get'])
    def stats(self, request, pk=None):
        account = self.get_object()
        lines = CorporateBankStatementLine.objects.filter(statement__bank_account=account)
        total = lines.count()
        done = lines.filter(is_reconciled=True).count()
        return Response({
            'book_balance': str(account.book_balance()),
            'statement_lines': total,
            'reconciled_lines': done,
            'reconciliation_health': round(done / total * 100, 1) if total else 100.0,
            'unmatched_ledger_lines': reconciliation.unmatched_ledger_lines(account).count(),
        })

    @action(detail=True, methods=['get'])
    def unmatched_ledger(self, request, pk=None):
        lines = reconciliation.unmatched_ledger_lines(self.get_object())
        return Response(LedgerLineSerializer(lines[:500], many=True).data)

    @action(detail=True, methods=['get'])
    def reconciliation(self, request, pk=None):
        try:
            as_of = date.fromisoformat(request.query_params['as_of']) if request.query_params.get('as_of') \
                else timezone.localdate()
        except ValueError:
            raise ValidationError({'as_of': 'Use YYYY-MM-DD.'})
        return Response(reconciliation.reconciliation_report(self.get_object(), as_of))


class CorporateBankStatementViewSet(viewsets.ModelViewSet):
    queryset = CorporateBankStatement.objects.select_related('bank_account').prefetch_related(
        'lines__journal_entry_line__entry')
    serializer_class = CorporateBankStatementSerializer
    filterset_fields = ['bank_account', 'status']
    ordering_fields = ['statement_date', 'created_at']

    @action(detail=False, methods=['post'], url_path='import')
    def import_file(self, request):
        account = get_object_or_404(BankAccount, pk=request.data.get('bank_account'))
        upload = request.FILES.get('file')
        if upload is None:
            raise ValidationError({'file': 'Attach the CSV statement.'})
        try:
            opening = Decimal(request.data['opening_balance']) if request.data.get('opening_balance') else None
        except InvalidOperation:
            raise ValidationError({'opening_balance': 'Must be a number.'})
        statement = reconciliation.import_statement_csv(account, upload, request.data.get('reference', ''),
                                                        opening_balance=opening, user=request.user)
        data = CorporateBankStatementSerializer(statement).data
        data['skipped_duplicates'] = statement.skipped_duplicates
        return Response(data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def auto_match(self, request, pk=None):
        return Response(reconciliation.auto_match_statement(self.get_object(), request.user))


class CorporateBankStatementLineViewSet(viewsets.ModelViewSet):
    queryset = CorporateBankStatementLine.objects.select_related(
        'statement__bank_account', 'journal_entry_line__entry')
    serializer_class = CorporateBankStatementLineSerializer
    filterset_fields = {'statement': ['exact'], 'statement__bank_account': ['exact'], 'is_reconciled': ['exact']}
    search_fields = ['reference', 'description']

    @action(detail=True, methods=['post'])
    def reconcile_manually(self, request, pk=None):
        # Both screens historically sent different keys; accept either.
        ledger_id = request.data.get('journal_line_id') or request.data.get('ledger_line_id')
        ledger_line = get_object_or_404(JournalLine.objects.select_related('entry'), pk=ledger_id)
        line = reconciliation.match(self.get_object(), ledger_line)
        return Response(CorporateBankStatementLineSerializer(line).data)

    @action(detail=True, methods=['post'])
    def unreconcile(self, request, pk=None):
        return Response(CorporateBankStatementLineSerializer(reconciliation.unmatch(self.get_object())).data)

    @action(detail=True, methods=['post'])
    def post_adjustment(self, request, pk=None):
        code = request.data.get('account_code')
        if not code:
            raise ValidationError({'account_code': 'Choose the account for this bank item (e.g. bank charges).'})
        line, entry = reconciliation.post_adjustment(self.get_object(), code, request.user,
                                                     request.data.get('description', ''))
        return Response({'line': CorporateBankStatementLineSerializer(line).data, 'journal_entry': entry.reference})


class ReconciliationRuleViewSet(viewsets.ModelViewSet):
    queryset = ReconciliationRule.objects.select_related('target_account')
    serializer_class = ReconciliationRuleSerializer
