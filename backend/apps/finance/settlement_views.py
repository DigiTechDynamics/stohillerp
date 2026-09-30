"""
Settlement endpoints, mixed into the AR/AP viewsets.

  POST customer-receipts/{id}/allocate/      {"allocations": [{"invoice": id, "amount": "100.00"}]}
  POST customer-receipts/{id}/refund/        {"amount", "bank_account", "date"?}
  POST customer-invoices/{id}/apply_credit/  (credit note) {"allocations": [...]}
  POST customer-invoices/{id}/write_off/     {"amount"?, "date"?, "reason"?}
  POST customer-invoices/{id}/refund/        (credit note) {"amount", "bank_account", "date"?}
  ... and the same on supplier-payments / supplier-invoices.
  GET  ar-allocations/, ap-allocations/      settlement history (filter by invoice, receipt/payment, credit_note)
  POST fx/revalue/                           {"as_of"} unrealised FX on open foreign items
"""

from datetime import date
from decimal import Decimal, InvalidOperation

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.finance.models import APAllocation, ARAllocation, BankAccount, CustomerInvoice, SupplierInvoice
from apps.finance.services.settlement import SettlementService


def _date(value, default=None):
    if not value:
        return default
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ValidationError({'date': 'Use YYYY-MM-DD.'})


def _amount(value, field='amount', required=True):
    if value in (None, ''):
        if required:
            raise ValidationError({field: 'This field is required.'})
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation:
        raise ValidationError({field: 'Must be a number.'})


def parse_allocations(data, invoice_model):
    rows = data.get('allocations')
    if not isinstance(rows, list) or not rows:
        raise ValidationError({'allocations': 'Provide a list of {"invoice": id, "amount": value}.'})
    return [(get_object_or_404(invoice_model, pk=row.get('invoice')), _amount(row.get('amount')))
            for row in rows]


def _allocation_summary(rows):
    return [{'invoice': r.invoice.invoice_number if r.invoice else None, 'amount': str(r.amount),
             'fx_difference': str(r.fx_difference),
             'journal_entry': r.journal_entry.reference if r.journal_entry else None} for r in rows]


class _CashSettlementActions:
    """For receipt / payment viewsets."""
    invoice_model = None

    @action(detail=True, methods=['post'])
    def allocate(self, request, pk=None):
        doc = self.get_object()
        rows = getattr(SettlementService(user=request.user), self.allocate_method)(
            doc, parse_allocations(request.data, self.invoice_model), _date(request.data.get('date')))
        doc.refresh_from_db()
        return Response({'allocations': _allocation_summary(rows), 'unapplied_amount': str(doc.unapplied_amount)})

    @action(detail=True, methods=['post'])
    def refund(self, request, pk=None):
        doc = self.get_object()
        bank = get_object_or_404(BankAccount, pk=request.data.get('bank_account') or doc.bank_account_id)
        row = SettlementService(user=request.user).refund(
            doc, _amount(request.data.get('amount')), bank, _date(request.data.get('date'), timezone.localdate()))
        doc.refresh_from_db()
        return Response({'refunded': str(row.amount), 'fx_difference': str(row.fx_difference),
                         'journal_entry': row.journal_entry.reference,
                         'unapplied_amount': str(doc.unapplied_amount)})


class ReceiptSettlementActions(_CashSettlementActions):
    invoice_model = CustomerInvoice
    allocate_method = 'allocate_receipt'


class PaymentSettlementActions(_CashSettlementActions):
    invoice_model = SupplierInvoice
    allocate_method = 'allocate_payment'


class InvoiceSettlementActions:
    """For customer / supplier invoice viewsets (invoices and credit notes)."""

    @action(detail=True, methods=['post'])
    def apply_credit(self, request, pk=None):
        note = self.get_object()
        rows = SettlementService(user=request.user).apply_credit_note(
            note, parse_allocations(request.data, type(note)), _date(request.data.get('date')))
        note.refresh_from_db()
        return Response({'allocations': _allocation_summary(rows), 'unapplied_amount': str(note.balance_due)})

    @action(detail=True, methods=['post'])
    def write_off(self, request, pk=None):
        invoice = self.get_object()
        row = SettlementService(user=request.user).write_off(
            invoice, _amount(request.data.get('amount'), required=False),
            _date(request.data.get('date')), request.data.get('reason', ''))
        invoice.refresh_from_db()
        return Response({'written_off': str(row.amount), 'journal_entry': row.journal_entry.reference,
                         'status': invoice.status, 'balance_due': str(invoice.balance_due)})

    @action(detail=True, methods=['post'])
    def refund(self, request, pk=None):
        note = self.get_object()
        bank = get_object_or_404(BankAccount, pk=request.data.get('bank_account'))
        row = SettlementService(user=request.user).refund(
            note, _amount(request.data.get('amount')), bank, _date(request.data.get('date'), timezone.localdate()))
        return Response({'refunded': str(row.amount), 'fx_difference': str(row.fx_difference),
                         'journal_entry': row.journal_entry.reference})


class ARAllocationSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True, default=None)
    receipt_reference = serializers.CharField(source='receipt.receipt_reference', read_only=True, default=None)
    credit_note_number = serializers.CharField(source='credit_note.invoice_number', read_only=True, default=None)
    journal_reference = serializers.CharField(source='journal_entry.reference', read_only=True, default=None)

    class Meta:
        model = ARAllocation
        fields = ['id', 'kind', 'allocation_date', 'amount', 'fx_difference', 'invoice', 'invoice_number',
                  'receipt', 'receipt_reference', 'credit_note', 'credit_note_number', 'journal_reference', 'notes']


class APAllocationSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True, default=None)
    payment_reference = serializers.CharField(source='payment.payment_reference', read_only=True, default=None)
    credit_note_number = serializers.CharField(source='credit_note.invoice_number', read_only=True, default=None)
    journal_reference = serializers.CharField(source='journal_entry.reference', read_only=True, default=None)

    class Meta:
        model = APAllocation
        fields = ['id', 'kind', 'allocation_date', 'amount', 'fx_difference', 'invoice', 'invoice_number',
                  'payment', 'payment_reference', 'credit_note', 'credit_note_number', 'journal_reference', 'notes']


class ARAllocationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ARAllocation.objects.select_related('invoice', 'receipt', 'credit_note', 'journal_entry')
    serializer_class = ARAllocationSerializer
    filterset_fields = ['invoice', 'receipt', 'credit_note', 'kind']


class APAllocationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = APAllocation.objects.select_related('invoice', 'payment', 'credit_note', 'journal_entry')
    serializer_class = APAllocationSerializer
    filterset_fields = ['invoice', 'payment', 'credit_note', 'kind']


class FXRevaluationView(APIView):
    """POST fx/revalue/ {"as_of": "YYYY-MM-DD"} - unrealised FX, auto-reversed the next day."""

    def post(self, request):
        as_of = _date(request.data.get('as_of'), timezone.localdate())
        entry, detail = SettlementService(user=request.user).revalue_open_items(as_of)
        return Response({'journal_entry': entry.reference if entry else None,
                         'auto_reverse_date': entry.auto_reverse_date if entry else None,
                         'items': detail},
                        status=status.HTTP_201_CREATED if entry else status.HTTP_200_OK)
