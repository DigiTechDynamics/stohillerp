"""
Property-management operations API (prefix propman/).

  tariffs/ meters/ meter-readings/          utilities; meters/{id}/reconciliation/?from&to (bulk meters)
  recovery-schedules/ recovery-shares/      recoveries; schedules/{id}/preview|reconcile  {from_date, to_date}
  recovery-reconciliations/                 history
  escalation-steps/ cpi/ lease-options/ guarantees/ turnover-reports/
  arrears-stages/ arrears-cases/            cases/{id}/promise|handover|note|write_off|next_stage; cases/run/
  debit-mandates/ debit-batches/            batches/{id}/file|results
  deposit-interest/                         history
  owner-payment-runs/                       preview/ (GET), create (POST), {id}/file/
  applications/                             {id}/credit_check|credit_result|approve|decline|convert
  maintenance-quotes/ maintenance-plans/    quotes/{id}/accept|reject; plans/run/
  reports/{key}/                            ?…params [&export_format=csv]
  saved-reports/                            the caller's saved reports
  distribution/invoices|statements|message  bulk e-mail / SMS
"""

from datetime import date
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.finance.models import BankAccount
from apps.propman import serializers as s
from apps.propman.models import (
    ArrearsCase, ArrearsStage, CPIIndex, DebitOrderBatch, DebitOrderMandate, DepositInterest, EscalationStep,
    LeaseGuarantee, LeaseOption, MaintenancePlan, MaintenanceQuote, Meter, MeterReading, OwnerPaymentRun,
    RecoveryReconciliation, RecoverySchedule, RecoveryShare, SavedReport, TenantApplication, TurnoverReport,
    UtilityTariff,
)
from apps.propman.services import arrears, collections, lettings, maintenance, owner_runs, recoveries, utilities
from apps.propman.services import distribution
from apps.propman.services.reports import REPORTS, run_report, to_csv


def _date(value, field='date', default=None):
    if value in (None, ''):
        if default is not None:
            return default
        raise ValidationError({field: 'This date is required (YYYY-MM-DD).'})
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ValidationError({field: 'Use YYYY-MM-DD.'})


def _decimal(value, field):
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError):
        raise ValidationError({field: 'Must be a number.'})


def _csv(content, filename):
    response = HttpResponse(content, content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


class _Base(viewsets.ModelViewSet):
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]


# ─── Utilities ───────────────────────────────────────────────────────────────

class UtilityTariffViewSet(_Base):
    queryset = UtilityTariff.objects.select_related('income_account')
    serializer_class = s.UtilityTariffSerializer
    filterset_fields = ['utility', 'is_active']


class MeterViewSet(_Base):
    queryset = Meter.objects.select_related('property', 'unit', 'tariff')
    serializer_class = s.MeterSerializer
    filterset_fields = ['property', 'unit', 'utility', 'is_active', 'bulk_meter']

    @action(detail=True, methods=['get'])
    def reconciliation(self, request, pk=None):
        meter = self.get_object()
        if meter.unit_id:
            raise ValidationError({'detail': 'Reconciliation is for bulk (property-level) meters.'})
        today = timezone.localdate()
        return Response(utilities.bulk_reconciliation(
            meter, _date(request.query_params.get('from_date'), 'from_date', today.replace(day=1)),
            _date(request.query_params.get('to_date'), 'to_date', today)))


class MeterReadingViewSet(_Base):
    """Create with {meter, reading_date, reading, is_estimate?, notes?}; consumption is calculated."""
    queryset = MeterReading.objects.select_related('meter', 'billed_invoice')
    serializer_class = s.MeterReadingSerializer
    filterset_fields = ['meter', 'meter__property', 'meter__unit', 'billed_invoice']
    ordering = ['-reading_date']

    def create(self, request, *args, **kwargs):
        meter = get_object_or_404(Meter, pk=request.data.get('meter'))
        reading = utilities.record_reading(
            meter, _date(request.data.get('reading_date'), 'reading_date'),
            _decimal(request.data.get('reading'), 'reading'),
            is_estimate=str(request.data.get('is_estimate', '')).lower() in ('true', '1', 'yes'),
            notes=request.data.get('notes', ''), user=request.user)
        return Response(self.get_serializer(reading).data, status=201)

    def update(self, request, *args, **kwargs):
        raise ValidationError({'detail': 'Correct a reading by deleting it and capturing it again.'})

    def perform_destroy(self, instance):
        if instance.billed_invoice_id:
            raise ValidationError({'detail': 'This reading has been billed and cannot be deleted.'})
        meter, when = instance.meter, instance.reading_date
        with transaction.atomic():
            instance.delete()
            later = meter.readings.filter(reading_date__gt=when).order_by('reading_date').first()
            if later:
                previous = meter.readings.filter(reading_date__lt=later.reading_date).order_by('-reading_date').first()
                later.consumption = (later.reading - previous.reading) * meter.multiplier if previous else 0
                later.save(update_fields=['consumption'])


# ─── Recoveries ──────────────────────────────────────────────────────────────

class RecoveryScheduleViewSet(_Base):
    queryset = RecoverySchedule.objects.select_related('property').prefetch_related('shares__lease__tenant',
                                                                                   'shares__lease__unit')
    serializer_class = s.RecoveryScheduleSerializer
    filterset_fields = ['property', 'is_active', 'category']

    def _period(self, request, schedule):
        start = _date(request.data.get('from_date') or request.query_params.get('from_date'), 'from_date',
                      schedule.year_start)
        end = _date(request.data.get('to_date') or request.query_params.get('to_date'), 'to_date')
        if end < start:
            raise ValidationError({'to_date': 'The end is before the start.'})
        return start, end

    @action(detail=True, methods=['get'])
    def preview(self, request, pk=None):
        schedule = self.get_object()
        data = recoveries.reconciliation_preview(schedule, *self._period(request, schedule))
        return Response({k: str(v) if isinstance(v, Decimal) else v for k, v in data.items()})

    @action(detail=True, methods=['post'])
    def reconcile(self, request, pk=None):
        schedule = self.get_object()
        rec = recoveries.reconcile(schedule, *self._period(request, schedule), post=bool(request.data.get('post')),
                                   user=request.user)
        return Response(s.RecoveryReconciliationSerializer(rec).data, status=201)


class RecoveryShareViewSet(_Base):
    queryset = RecoveryShare.objects.select_related('schedule', 'lease__tenant', 'lease__unit')
    serializer_class = s.RecoveryShareSerializer
    filterset_fields = ['schedule', 'lease']


class RecoveryReconciliationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = RecoveryReconciliation.objects.select_related('schedule')
    serializer_class = s.RecoveryReconciliationSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['schedule']


# ─── Lease terms ─────────────────────────────────────────────────────────────

class EscalationStepViewSet(_Base):
    queryset = EscalationStep.objects.all()
    serializer_class = s.EscalationStepSerializer
    filterset_fields = ['lease']

    def perform_update(self, serializer):
        if serializer.instance.applied_on:
            raise ValidationError({'detail': 'This step has been applied and can no longer change.'})
        serializer.save()

    def perform_destroy(self, instance):
        if instance.applied_on:
            raise ValidationError({'detail': 'This step has been applied and can no longer be removed.'})
        instance.delete()


class CPIIndexViewSet(_Base):
    queryset = CPIIndex.objects.all()
    serializer_class = s.CPIIndexSerializer
    ordering = ['-month']


class LeaseOptionViewSet(_Base):
    queryset = LeaseOption.objects.select_related('lease__tenant')
    serializer_class = s.LeaseOptionSerializer
    filterset_fields = ['lease', 'status', 'option_type']

    @action(detail=True, methods=['post'])
    def decide(self, request, pk=None):
        """{"status": "exercised"|"declined"}"""
        option = self.get_object()
        status = request.data.get('status')
        if status not in (LeaseOption.Status.EXERCISED, LeaseOption.Status.DECLINED):
            raise ValidationError({'status': 'Choose exercised or declined.'})
        if option.status != LeaseOption.Status.OPEN:
            raise ValidationError({'detail': f'The option is already {option.get_status_display().lower()}.'})
        option.status = status
        option.save(update_fields=['status'])
        return Response(self.get_serializer(option).data)


class LeaseGuaranteeViewSet(_Base):
    queryset = LeaseGuarantee.objects.select_related('lease__tenant')
    serializer_class = s.LeaseGuaranteeSerializer
    filterset_fields = ['lease', 'status', 'guarantee_type']


class TurnoverReportViewSet(_Base):
    queryset = TurnoverReport.objects.select_related('lease', 'billed_invoice')
    serializer_class = s.TurnoverReportSerializer
    filterset_fields = ['lease']
    ordering = ['-month']

    def perform_create(self, serializer):
        serializer.save(submitted_by=self.request.user)

    def perform_destroy(self, instance):
        if instance.billed_invoice_id:
            raise ValidationError({'detail': 'This month has been billed and cannot be deleted.'})
        instance.delete()


# ─── Arrears ─────────────────────────────────────────────────────────────────

class ArrearsStageViewSet(_Base):
    queryset = ArrearsStage.objects.all()
    serializer_class = s.ArrearsStageSerializer
    pagination_class = None


class ArrearsCaseViewSet(viewsets.ModelViewSet):
    queryset = ArrearsCase.objects.select_related('lease__tenant', 'lease__property', 'stage') \
        .prefetch_related('actions__messages', 'actions__stage', 'actions__created_by')
    serializer_class = s.ArrearsCaseSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'stage', 'lease', 'lease__property']
    search_fields = ['lease__lease_number', 'lease__tenant__first_name', 'lease__tenant__last_name']
    ordering_fields = ['amount_overdue', 'oldest_due_date', 'opened_on']
    http_method_names = ['get', 'patch', 'post', 'head', 'options']

    def create(self, request, *args, **kwargs):
        raise ValidationError({'detail': 'Cases are opened automatically for overdue leases; use run/.'})

    @action(detail=False, methods=['post'])
    def run(self, request):
        return Response({'result': arrears.run_arrears(user=request.user)})

    @action(detail=True, methods=['post'])
    def promise(self, request, pk=None):
        case = self.get_object()
        arrears.record_promise(case, _date(request.data.get('promise_date'), 'promise_date'),
                               _decimal(request.data.get('amount'), 'amount'), request.user,
                               request.data.get('note', ''))
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=['post'])
    def handover(self, request, pk=None):
        case = self.get_object()
        arrears.hand_over(case, request.data.get('attorney', ''), request.data.get('reference', ''), request.user,
                          request.data.get('note', ''))
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=['post'])
    def note(self, request, pk=None):
        from apps.propman.models import ArrearsAction
        case = self.get_object()
        if not request.data.get('note'):
            raise ValidationError({'note': 'Write the note.'})
        ArrearsAction.objects.create(case=case, action='note', description=request.data['note'],
                                     amount_overdue=case.amount_overdue, created_by=request.user)
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=['post'])
    def next_stage(self, request, pk=None):
        """Send the next stage now, without waiting for the debt to age."""
        case = self.get_object()
        if case.status not in arrears.OPEN_CASE:
            raise ValidationError({'detail': 'This case is closed.'})
        current = case.stage.sequence if case.stage_id else -1
        stage = ArrearsStage.objects.filter(is_active=True, sequence__gt=current).order_by('sequence').first()
        if stage is None:
            raise ValidationError({'detail': 'The case is already at the last stage.'})
        arrears.send_stage(case, stage, request.user)
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        """{"status": "written_off"|"settled", "note"?} - writing off the debt itself is done in AR."""
        from apps.propman.models import ArrearsAction
        case = self.get_object()
        status = request.data.get('status')
        if status not in (ArrearsCase.Status.WRITTEN_OFF, ArrearsCase.Status.SETTLED):
            raise ValidationError({'status': 'Choose written_off or settled.'})
        case.status, case.closed_on = status, timezone.localdate()
        case.save(update_fields=['status', 'closed_on', 'updated_at'])
        ArrearsAction.objects.create(case=case, action=status, description=request.data.get('note', ''),
                                     amount_overdue=case.amount_overdue, created_by=request.user)
        return Response(self.get_serializer(case).data)


# ─── Collections ─────────────────────────────────────────────────────────────

class DebitOrderMandateViewSet(_Base):
    queryset = DebitOrderMandate.objects.select_related('lease__tenant')
    serializer_class = s.DebitOrderMandateSerializer
    filterset_fields = ['lease', 'status', 'collection_day']


class DebitOrderBatchViewSet(viewsets.ModelViewSet):
    """Create with {collection_date, bank_account, all_mandates?}."""
    queryset = DebitOrderBatch.objects.select_related('bank_account').prefetch_related('items__mandate__lease__tenant')
    serializer_class = s.DebitOrderBatchSerializer
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def create(self, request, *args, **kwargs):
        bank = get_object_or_404(BankAccount, pk=request.data.get('bank_account'))
        batch = collections.create_batch(_date(request.data.get('collection_date'), 'collection_date'), bank,
                                         all_mandates=bool(request.data.get('all_mandates')), user=request.user)
        return Response(self.get_serializer(batch).data, status=201)

    def perform_destroy(self, instance):
        if instance.status != DebitOrderBatch.Status.DRAFT:
            raise ValidationError({'detail': 'Only draft batches can be deleted.'})
        instance.delete()

    @action(detail=True, methods=['get'])
    def file(self, request, pk=None):
        batch = self.get_object()
        if batch.status == DebitOrderBatch.Status.DRAFT:
            batch.status = DebitOrderBatch.Status.SUBMITTED
            batch.save(update_fields=['status'])
        return _csv(collections.batch_file(batch), f'{batch.number}.csv')

    @action(detail=True, methods=['post'])
    def results(self, request, pk=None):
        """{"results": [{"item", "status": "paid"|"unpaid", "reason"?}]}"""
        outcome = collections.process_results(self.get_object(), request.data.get('results') or [], request.user)
        return Response({**outcome, 'batch': self.get_serializer(self.get_object()).data})


class DepositInterestViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = DepositInterest.objects.select_related('lease')
    serializer_class = s.DepositInterestSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['lease', 'month']


# ─── Owners ──────────────────────────────────────────────────────────────────

class OwnerPaymentRunViewSet(viewsets.ModelViewSet):
    """GET preview/ ?minimum ; POST {run_date?, bank_account, owners?: [ids], minimum?}"""
    queryset = OwnerPaymentRun.objects.select_related('bank_account')
    serializer_class = s.OwnerPaymentRunSerializer
    http_method_names = ['get', 'post', 'head', 'options']

    @action(detail=False, methods=['get'])
    def preview(self, request):
        return Response({'owners': owner_runs.payment_run_preview(
            minimum=_decimal(request.query_params.get('minimum') or 0, 'minimum'))})

    def create(self, request, *args, **kwargs):
        bank = get_object_or_404(BankAccount, pk=request.data.get('bank_account'))
        run = owner_runs.run_owner_payments(
            _date(request.data.get('run_date'), 'run_date', timezone.localdate()), bank,
            owner_ids=request.data.get('owners') or None,
            minimum=_decimal(request.data.get('minimum') or 0, 'minimum'), user=request.user)
        return Response(self.get_serializer(run).data, status=201)

    @action(detail=True, methods=['get'])
    def file(self, request, pk=None):
        run = self.get_object()
        return _csv(owner_runs.bank_file(run), f'{run.number}.csv')


# ─── Lettings ────────────────────────────────────────────────────────────────

class TenantApplicationViewSet(_Base):
    queryset = TenantApplication.objects.select_related('applicant', 'property', 'unit', 'lease')
    serializer_class = s.TenantApplicationSerializer
    filterset_fields = ['property', 'unit', 'status', 'credit_status']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def _ok(self):
        return Response(self.get_serializer(self.get_object()).data)

    @action(detail=True, methods=['post'])
    def credit_check(self, request, pk=None):
        lettings.request_credit_check(self.get_object(), request.user)
        return self._ok()

    @action(detail=True, methods=['post'])
    def credit_result(self, request, pk=None):
        score = request.data.get('score')
        lettings.record_credit_result(self.get_object(), request.data.get('status'),
                                      int(score) if score not in (None, '') else None,
                                      request.data.get('reference', ''), request.data.get('notes', ''), request.user)
        return self._ok()

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        lettings.decide(self.get_object(), True, request.data.get('note', ''), request.user)
        return self._ok()

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        lettings.decide(self.get_object(), False, request.data.get('note', ''), request.user)
        return self._ok()

    @action(detail=True, methods=['post'])
    def convert(self, request, pk=None):
        lease = lettings.convert_to_lease(
            self.get_object(), _date(request.data.get('start_date'), 'start_date'),
            request.data.get('monthly_rental'), request.data.get('deposit'),
            _date(request.data.get('end_date'), 'end_date') if request.data.get('end_date') else None, request.user,
            vat_applicable=str(request.data.get('vat_applicable', '')).lower() in ('true', '1', 'yes', 'on'))
        return Response({'lease': str(lease.pk), 'lease_number': lease.lease_number}, status=201)


# ─── Maintenance ─────────────────────────────────────────────────────────────

class MaintenanceQuoteViewSet(_Base):
    queryset = MaintenanceQuote.objects.select_related('supplier', 'request', 'purchase_order')
    serializer_class = s.MaintenanceQuoteSerializer
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    filterset_fields = ['request', 'supplier', 'status']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        quote = maintenance.accept_quote(self.get_object(), request.user)
        return Response(self.get_serializer(quote).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        quote = maintenance.reject_quote(self.get_object(), request.user, request.data.get('note', ''))
        return Response(self.get_serializer(quote).data)


class MaintenancePlanViewSet(_Base):
    queryset = MaintenancePlan.objects.select_related('property', 'contractor')
    serializer_class = s.MaintenancePlanSerializer
    filterset_fields = ['property', 'is_active']

    @action(detail=False, methods=['post'])
    def run(self, request):
        return Response({'result': maintenance.raise_planned_jobs()})


# ─── Reports, saved reports, distribution ────────────────────────────────────

class ReportView(APIView):
    def get(self, request, key):
        if key not in REPORTS:
            raise ValidationError({'detail': f'Unknown report. Choose one of: {", ".join(REPORTS)}.'})
        params = {k: v for k, v in request.query_params.items() if k != 'export_format'}
        try:
            report = run_report(key, params)
        except ValueError as e:
            raise ValidationError({'detail': str(e)})
        if request.query_params.get('export_format') == 'csv':
            return _csv(to_csv(report), f'{key}_{timezone.localdate()}.csv')
        return Response(report)


class SavedReportViewSet(viewsets.ModelViewSet):
    serializer_class = s.SavedReportSerializer
    pagination_class = None

    def get_queryset(self):
        return SavedReport.objects.filter(owner=self.request.user)

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class DistributionView(APIView):
    """POST distribution/invoices|statements|message/"""

    def post(self, request, kind):
        data = request.data
        if kind == 'invoices':
            return Response(distribution.email_invoices_for_period(
                _date(data.get('period_start'), 'period_start'), data.get('property'), request.user))
        audience = data.get('audience')
        if audience not in ('tenants', 'owners'):
            raise ValidationError({'audience': 'Choose tenants or owners.'})
        if kind == 'statements':
            return Response(distribution.email_statements(
                audience, data.get('property'), data.get('portfolio'),
                _date(data.get('from_date'), 'from_date') if data.get('from_date') else None,
                _date(data.get('to_date'), 'to_date') if data.get('to_date') else None, request.user))
        if kind == 'message':
            if not data.get('subject') or not data.get('body'):
                raise ValidationError({'detail': 'Write a subject and a message.'})
            channels = [c for c in (data.get('channels') or ['email']) if c in ('email', 'sms')]
            if not channels:
                raise ValidationError({'channels': 'Choose email and/or SMS.'})
            return Response(distribution.send_bulk_message(audience, data['subject'], data['body'], channels,
                                                           data.get('property'), data.get('portfolio'), request.user))
        raise ValidationError({'detail': 'Unknown distribution.'})
