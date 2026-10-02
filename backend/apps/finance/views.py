"""Stohil Properties - Finance Views"""
from rest_framework import viewsets, filters, status  # type: ignore
from rest_framework.decorators import action  # type: ignore
from rest_framework.response import Response  # type: ignore
from rest_framework.views import APIView  # type: ignore
from django_filters.rest_framework import DjangoFilterBackend  # type: ignore
import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import models, transaction
from django.utils import timezone
from django.db.models import Sum, Count, Case, When, Q  # type: ignore
from django.http import HttpResponse
from datetime import date
from decimal import Decimal

from apps.finance.models import (  # type: ignore
    ChartOfAccount, Journal, JournalBatch, JournalEntry, JournalLine,
    FiscalPeriod, FiscalYear, ExchangeRate,
    CustomerProfile, Supplier, PostingProfile
)
from apps.core.models import Currency
from apps.finance.serializers import (  # type: ignore
    PostingProfileSerializer, CurrencySerializer
)
from apps.hr.models import Employee  # type: ignore



from apps.finance.settlement_views import (  # type: ignore
    InvoiceSettlementActions, PaymentSettlementActions, ReceiptSettlementActions, parse_allocations,
)
from apps.finance.statements import CustomerStatementActions, SupplierStatementActions  # type: ignore
from apps.finance.approval_views import ApprovalActions  # type: ignore
from apps.procurement.match_views import InvoiceMatchActions  # type: ignore
from apps.finance.services import approvals  # type: ignore
from utils.record_rules import RecordRulesMixin
from apps.portal.views import InviteSupplierToPortalActions

logger = logging.getLogger('stohill.finance')

class CurrencyViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = Currency.objects.all().order_by('code')
    serializer_class = CurrencySerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['is_active', 'is_base']
    search_fields = ['code', 'name']


class PostingProfileViewSet(viewsets.ModelViewSet):
    queryset = PostingProfile.objects.all()
    serializer_class = PostingProfileSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    search_fields = ['name']
    
    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        serializer.save(updated_by=self.request.user)


class UnifiedAccountSearchView(APIView):
    """
    Combines GL Accounts, Customers, Suppliers, and Employees into a single searchable list.
    Used by the frontend AccountCombobox.
    """

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        if not query:
            return Response([])

        results = []

        # 1. GL Accounts
        accounts = ChartOfAccount.objects.filter(
            Q(code__icontains=query) | Q(name__icontains=query),
            is_active=True
        )[:10]
        for acc in accounts:
            results.append({
                'id': str(acc.id),
                'type': 'account',
                'code': acc.code,
                'name': acc.name,
                'display': f"[{acc.code}] {acc.name}",
                'entity_id': str(acc.id)
            })

        # 2. Customers
        customers = CustomerProfile.objects.filter(
            Q(contact_link__first_name__icontains=query) | 
            Q(contact_link__last_name__icontains=query) |
            Q(name__icontains=query),
            is_active=True
        ).select_related('contact_link')[:10]
        for cust in customers:
            name = cust.contact_link.full_name if cust.contact_link else cust.name
            results.append({
                'id': f"cust_{cust.id}",
                'type': 'customer',
                'code': 'AR',
                'name': name,
                'display': f"[Customer] {name}",
                'entity_id': str(cust.contact_link_id) if cust.contact_link else None
            })

        # 3. Suppliers
        suppliers = Supplier.objects.filter(
            name__icontains=query,
            is_active=True
        )[:10]
        for sup in suppliers:
            results.append({
                'id': f"sup_{sup.id}",
                'type': 'supplier',
                'code': 'AP',
                'name': sup.name,
                'display': f"[Supplier] {sup.name}",
                'entity_id': str(sup.id)
            })

        # 4. Employees
        employees = Employee.objects.filter(
            Q(first_name__icontains=query) | Q(last_name__icontains=query) | Q(employee_number__icontains=query),
            status='active'
        )[:10]
        for emp in employees:
            results.append({
                'id': f"emp_{emp.id}",
                'type': 'employee',
                'code': emp.employee_number,
                'name': emp.full_name,
                'display': f"[Employee] {emp.full_name}",
                'entity_id': str(emp.id)
            })

        return Response(results)



class ChartOfAccountViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = ChartOfAccount.objects.select_related('parent').order_by('code')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['account_type', 'account_sub_type', 'is_active', 'allow_direct_posting']
    search_fields = ['code', 'name']

    def get_serializer_class(self):
        from apps.finance.serializers import ChartOfAccountSerializer  # type: ignore
        return ChartOfAccountSerializer


class JournalViewSet(viewsets.ModelViewSet):
    queryset = Journal.objects.all()

    def get_serializer_class(self):
        from apps.finance.serializers import JournalSerializer  # type: ignore
        return JournalSerializer


class JournalBatchViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = JournalBatch.objects.select_related('journal', 'fiscal_period', 'maker', 'checker').prefetch_related('entries')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'journal', 'fiscal_period', 'maker']
    search_fields = ['batch_number', 'description']
    ordering_fields = ['created_at', 'batch_number']

    def get_serializer_class(self):
        from apps.finance.serializers import JournalBatchSerializer  # type: ignore
        return JournalBatchSerializer

    def perform_destroy(self, instance):
        """A draft batch is deleted together with its draft entries (they'd block it otherwise)."""
        from utils.record_rules import delete_lock
        from rest_framework.exceptions import ValidationError as DRFValidationError

        reason = delete_lock(instance)
        if reason:
            raise DRFValidationError({'detail': reason})
        with transaction.atomic():
            instance.entries.filter(status=JournalEntry.EntryStatus.DRAFT).delete()
            super().perform_destroy(instance)

    # All three workflow actions lock the batch row (select_for_update) inside a
    # transaction, so concurrent clicks can't approve or post a batch twice.

    def _locked_batch(self):
        batch = self.get_object()  # enforces permissions / 404
        return JournalBatch.objects.select_for_update().get(pk=batch.pk)

    @action(detail=True, methods=['post'])
    def submit_for_approval(self, request, pk=None):
        with transaction.atomic():
            batch = self._locked_batch()
            if batch.status != JournalBatch.BatchStatus.DRAFT:
                return Response({'error': 'Only draft batches can be submitted.'}, status=400)
            if not batch.is_balanced():
                return Response({'error': 'Batch is out of balance. Debits must equal credits.'}, status=400)

            batch.status = JournalBatch.BatchStatus.PENDING_APPROVAL
            batch.save(update_fields=['status'])
            batch.entries.update(status=JournalEntry.EntryStatus.PENDING_APPROVAL)
        return Response({'status': 'submitted', 'batch_number': batch.batch_number})

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        with transaction.atomic():
            batch = self._locked_batch()
            if batch.status != JournalBatch.BatchStatus.PENDING_APPROVAL:
                return Response({'error': 'Batch is not pending approval.'}, status=400)

            # Segregation of duties applies to everyone, superusers included.
            # (A former superuser bypass here also crashed with a 500, because
            # JournalBatch.save() enforces maker != checker at the model level.)
            if batch.maker_id == request.user.id:
                return Response(
                    {'error': 'Maker cannot approve their own batch. Role segregation required.'},
                    status=400,
                )

            batch.status = JournalBatch.BatchStatus.APPROVED
            batch.checker = request.user
            batch.approved_at = timezone.now()
            batch.save(update_fields=['status', 'checker', 'approved_at'])
            batch.entries.update(status=JournalEntry.EntryStatus.APPROVED)
        logger.info('Batch %s approved by user %s', batch.batch_number, request.user.pk)
        return Response({'status': 'approved'})

    @action(detail=True, methods=['post'])
    def post_batch(self, request, pk=None):
        from apps.finance.services.accounting import AccountingError, AccountingService  # type: ignore

        service = AccountingService(user=request.user)
        try:
            # All-or-nothing: if any entry fails, no entry in the batch posts.
            with transaction.atomic():
                batch = self._locked_batch()
                if batch.status != JournalBatch.BatchStatus.APPROVED:
                    return Response({'error': 'Batch must be approved before posting.'}, status=400)

                for entry in batch.entries.filter(status=JournalEntry.EntryStatus.APPROVED):
                    service.post_saved_entry(entry)

                batch.status = JournalBatch.BatchStatus.POSTED
                batch.posted_by = request.user
                batch.posted_at = timezone.now()
                batch.save(update_fields=['status', 'posted_by', 'posted_at'])
        except (AccountingError, DjangoValidationError) as exc:
            # Business-rule failures are safe to show the user; anything else
            # propagates to the global handler (logged, generic 500).
            message = exc.messages[0] if isinstance(exc, DjangoValidationError) else str(exc)
            return Response({'error': message}, status=400)
        logger.info('Batch %s posted by user %s', batch.batch_number, request.user.pk)
        return Response({'status': 'posted'})


class JournalEntryViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = JournalEntry.objects.select_related('journal', 'fiscal_period').prefetch_related('lines__account')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'entry_type', 'journal', 'fiscal_period']
    search_fields = ['reference', 'description', 'source_reference']
    ordering_fields = ['entry_date', 'created_at', 'reference', 'description']

    def get_serializer_class(self):
        from apps.finance.serializers import JournalEntrySerializer  # type: ignore
        return JournalEntrySerializer

    @action(detail=True, methods=['post'])
    def post_entry(self, request, pk=None):
        """Post a draft journal entry."""
        entry = self.get_object()
        from apps.finance.services.accounting import AccountingService, AccountingError  # type: ignore
        service = AccountingService(user=request.user)
        try:
            service.post_saved_entry(entry)
            return Response({'status': 'posted', 'reference': entry.reference})
        except AccountingError as e:
            return Response({'error': str(e)}, status=400)
        except Exception as e:
            return Response({'error': f'An unexpected error occurred: {str(e)}'}, status=500)

    @action(detail=True, methods=['post'])
    def reverse(self, request, pk=None):
        """Create a reversal of a posted entry."""
        entry = self.get_object()
        from apps.finance.services.accounting import AccountingService  # type: ignore
        service = AccountingService(user=request.user)
        try:
            reversal = service.create_reversal(entry)
            return Response({'reversal_reference': reversal.reference})
        except Exception as e:
            return Response({'error': str(e)}, status=400)


class FiscalYearViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = FiscalYear.objects.all().order_by('-start_date')

    def get_serializer_class(self):
        from apps.finance.serializers import FiscalYearSerializer  # type: ignore
        return FiscalYearSerializer

    @action(detail=True, methods=['post'])
    def generate_periods(self, request, pk=None):
        """Generate 12 monthly periods for this fiscal year."""
        fiscal_year = self.get_object()
        if fiscal_year.periods.exists():
            return Response({'error': 'Periods already exist for this fiscal year'}, status=400)
        
        import calendar
        from datetime import date
        from apps.finance.models import FiscalPeriod  # type: ignore
        
        periods = []
        current_date = fiscal_year.start_date
        for i in range(1, 13):
            last_day = calendar.monthrange(current_date.year, current_date.month)[1]
            end_date = date(current_date.year, current_date.month, last_day)
            
            period = FiscalPeriod.objects.create(
                fiscal_year=fiscal_year,
                name=current_date.strftime('%B %Y'),
                period_number=i,
                start_date=current_date,
                end_date=end_date,
                status=FiscalPeriod.PeriodStatus.OPEN
            )
            periods.append(period)
            
            # Move to next month
            if current_date.month == 12:
                current_date = date(current_date.year + 1, 1, 1)
            else:
                current_date = date(current_date.year, current_date.month + 1, 1)
                
        return Response({'status': 'periods_generated', 'count': len(periods)})

    @action(detail=True, methods=['post'])
    def close_year(self, request, pk=None):
        """
        Close the fiscal year: post the closing entry (P&L -> retained
        earnings) and close every period. Previously this only set flags, so
        revenue and expenses were never rolled into retained earnings.
        """
        from apps.finance.services.accounting import AccountingError, AccountingService  # type: ignore
        try:
            entry = AccountingService(user=request.user).close_fiscal_year(self.get_object())
        except AccountingError as e:
            return Response({'error': str(e)}, status=400)
        return Response({'status': 'year_closed', 'closing_entry': entry.reference if entry else None})

    @action(detail=True, methods=['post'])
    def reopen_year(self, request, pk=None):
        """Reopen a closed fiscal year and reverse its closing entry."""
        from apps.finance.services.accounting import AccountingError, AccountingService  # type: ignore
        try:
            reversal = AccountingService(user=request.user).reopen_fiscal_year(self.get_object())
        except AccountingError as e:
            return Response({'error': str(e)}, status=400)
        return Response({'status': 'year_reopened', 'reversal_entry': reversal.reference if reversal else None})

class FiscalPeriodViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = FiscalPeriod.objects.select_related('fiscal_year').order_by('-start_date')

    def get_serializer_class(self):
        from apps.finance.serializers import FiscalPeriodSerializer  # type: ignore
        return FiscalPeriodSerializer

    @action(detail=True, methods=['post'])
    def lock(self, request, pk=None):
        period = self.get_object()
        from django.utils import timezone  # type: ignore
        period.status = 'locked'
        period.locked_at = timezone.now()
        period.locked_by = request.user
        period.save(update_fields=['status', 'locked_at', 'locked_by'])
        return Response({'status': 'locked'})

    @action(detail=True, methods=['post'])
    def unlock(self, request, pk=None):
        period = self.get_object()
        period.status = 'open'
        period.locked_at = None
        period.locked_by = None
        period.save(update_fields=['status', 'locked_at', 'locked_by'])
        return Response({'status': 'unlocked'})

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        period = self.get_object()
        period.status = 'closed'
        period.save(update_fields=['status'])
        return Response({'status': 'closed'})

    @action(detail=True, methods=['post'])
    def reopen(self, request, pk=None):
        """Reopen a closed or locked period."""
        period = self.get_object()
        if period.fiscal_year.is_closed:
            return Response({'error': 'Cannot reopen period because the fiscal year is closed.'}, status=400)
        period.status = 'open'
        period.locked_at = None
        period.locked_by = None
        period.save(update_fields=['status', 'locked_at', 'locked_by'])
        return Response({'status': 'reopened'})


class ExchangeRateViewSet(viewsets.ModelViewSet):
    queryset = ExchangeRate.objects.all().order_by('-effective_date')
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['currency', 'effective_date']
    ordering_fields = ['effective_date']

    def get_serializer_class(self):
        from apps.finance.serializers import ExchangeRateSerializer  # type: ignore
        return ExchangeRateSerializer


class TrialBalanceView(APIView):
    """Generate Trial Balance report for a fiscal period."""

    def get(self, request):
        period_id = request.query_params.get('period_id')
        if not period_id:
            return Response({'error': 'period_id required'}, status=400)
        property_id = request.query_params.get('property_id')

        try:
            period = FiscalPeriod.objects.get(id=period_id)
        except FiscalPeriod.DoesNotExist:
            return Response({'error': 'Period not found'}, status=404)

        from apps.finance.services.accounting import AccountingService  # type: ignore
        service = AccountingService(user=request.user)
        data = service.generate_trial_balance(period, property_id=property_id,
                                              cost_center_id=request.query_params.get('cost_center'))
        return Response(data)


class IncomeStatementView(APIView):
    """Generate Income Statement for a date range."""

    def get(self, request):
        try:
            from_date = date.fromisoformat(request.query_params.get('from_date', ''))
            to_date = date.fromisoformat(request.query_params.get('to_date', ''))
        except ValueError:
            return Response({'error': 'from_date and to_date are required (YYYY-MM-DD)'},
                            status=status.HTTP_400_BAD_REQUEST)

        property_id = request.query_params.get('property_id')

        # Year-end closing entries zero the P&L accounts; including them would
        # make every closed year report nil revenue and expenses.
        qs = JournalLine.objects.filter(
            entry__status__in=JournalEntry.LEDGER_STATUSES,
            entry__entry_date__range=[from_date, to_date],
            account__account_type__in=['revenue', 'expense']
        ).exclude(entry__source_module='year_end')

        if property_id:
            qs = qs.filter(property_ref_id=property_id)
        if request.query_params.get('cost_center'):
            qs = qs.filter(cost_center_id=request.query_params['cost_center'])

        lines = qs.values(
            'account__code', 'account__name', 'account__account_type'
        ).annotate(
            total_debit=Sum('amount', filter=Q(side='debit')),
            total_credit=Sum('amount', filter=Q(side='credit')),
        ).order_by('account__account_type', 'account__code')

        revenue = []
        expenses = []
        total_revenue = Decimal('0.00')
        total_expenses = Decimal('0.00')

        for line in lines:
            dr = line['total_debit'] or Decimal('0.00')
            cr = line['total_credit'] or Decimal('0.00')
            
            if line['account__account_type'] == 'revenue':
                net = cr - dr
                if net != 0:
                    revenue.append({'code': line['account__code'], 'name': line['account__name'], 'amount': str(net)})
                    total_revenue += net
            else:  # expense
                net = dr - cr
                if net != 0:
                    expenses.append({'code': line['account__code'], 'name': line['account__name'], 'amount': str(net)})
                    total_expenses += net

        net_profit = total_revenue - total_expenses
        profit_margin = Decimal('0.00')
        if total_revenue > 0:
            profit_margin = (net_profit / total_revenue * 100).quantize(Decimal('0.01'))

        return Response({
            'from_date': from_date,
            'to_date': to_date,
            'revenue': revenue,
            'expenses': expenses,
            'total_revenue': str(total_revenue),
            'total_expenses': str(total_expenses),
            'net_profit': str(net_profit),
            'profit_margin': str(profit_margin),
        })


class BalanceSheetView(APIView):
    """Generate Balance Sheet as at a specific date."""

    def get(self, request):
        # Default to today. A missing date used to reach the ORM as None and
        # crash with a 500 ("Cannot use None as a query value").
        raw_date = request.query_params.get('as_at_date')
        if raw_date:
            try:
                as_at_date = date.fromisoformat(raw_date)
            except ValueError:
                return Response({'error': 'as_at_date must be YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            as_at_date = timezone.localdate()

        lines = JournalLine.objects.filter(
            entry__status__in=JournalEntry.LEDGER_STATUSES,
            entry__entry_date__lte=as_at_date,
            account__account_type__in=['asset', 'liability', 'equity']
        ).values(
            'account__code', 'account__name', 'account__account_type'
        ).annotate(
            total_debit=Sum('amount', filter=Q(side='debit')),
            total_credit=Sum('amount', filter=Q(side='credit')),
        ).order_by('account__account_type', 'account__code')

        assets, liabilities, equity = [], [], []
        totals = {'asset': Decimal('0'), 'liability': Decimal('0'), 'equity': Decimal('0')}

        for line in lines:
            dr = line['total_debit'] or Decimal('0')
            cr = line['total_credit'] or Decimal('0')
            t = line['account__account_type']

            if t == 'asset':
                net = dr - cr
            else:  # liability or equity
                net = cr - dr
            
            if net != 0:
                item = {'code': line['account__code'], 'name': line['account__name'], 'amount': str(net)}
                totals[t] += net
                if t == 'asset': assets.append(item)
                elif t == 'liability': liabilities.append(item)
                else: equity.append(item)

        # Unclosed earnings: until a year-end closing entry moves profit into
        # retained earnings, revenue/expense balances must still appear in
        # equity or the balance sheet can never balance.
        pnl = JournalLine.objects.filter(
            entry__status__in=JournalEntry.LEDGER_STATUSES,
            entry__entry_date__lte=as_at_date,
            account__account_type__in=['revenue', 'expense'],
        ).aggregate(
            dr=Sum('amount', filter=Q(side='debit')),
            cr=Sum('amount', filter=Q(side='credit')),
        )
        unclosed_earnings = (pnl['cr'] or Decimal('0')) - (pnl['dr'] or Decimal('0'))
        if unclosed_earnings != 0:
            equity.append({'code': '', 'name': 'Current Earnings (unclosed)', 'amount': str(unclosed_earnings)})
            totals['equity'] += unclosed_earnings

        return Response({
            'as_at_date': as_at_date.isoformat(),
            'assets': assets,
            'liabilities': liabilities,
            'equity': equity,
            'total_assets': str(totals['asset']),
            'total_liabilities': str(totals['liability']),
            'total_equity': str(totals['equity']),
            'balanced': totals['asset'] == (totals['liability'] + totals['equity']),
        })


class ReportExportView(APIView):
    """Export financial reports to CSV format."""

    def get(self, request, report_id):
        logger.debug("Exporting report %s", report_id)
        format_type = request.query_params.get('export_format', 'csv')
        
        # Re-use existing view logic to get data
        if report_id == 'trial-balance':
            view = TrialBalanceView.as_view()
        elif report_id == 'income-statement':
            view = IncomeStatementView.as_view()
        elif report_id == 'balance-sheet':
            view = BalanceSheetView.as_view()
        elif report_id == 'vat-return':
            view = VATReturnView.as_view()
        elif report_id in ('ar-aging', 'ap-aging'):
            from apps.finance.reports import AgingReportView  # type: ignore
            view = AgingReportView.as_view(kind=report_id[:2])
        elif report_id == 'general-ledger':
            from apps.finance.reports import GeneralLedgerView  # type: ignore
            view = GeneralLedgerView.as_view()
        elif report_id == 'budget-vs-actual':
            from apps.finance.reports import BudgetVsActualView  # type: ignore
            view = BudgetVsActualView.as_view()
        elif report_id == 'cash-flow':
            from apps.finance.reports import CashFlowView  # type: ignore
            view = CashFlowView.as_view()
        else:
            return Response({'error': 'Invalid report ID'}, status=400)

        response = view(request._request)
        if response.status_code != 200:
            return response

        data = response.data
        
        output = HttpResponse(content_type='text/csv')
        output['Content-Disposition'] = f'attachment; filename="{report_id}.csv"'
        
        if format_type == 'pdf':
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import letter
            from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
            from reportlab.lib.styles import getSampleStyleSheet
            
            output = HttpResponse(content_type='application/pdf')
            output['Content-Disposition'] = f'attachment; filename="{report_id}.pdf"'
            
            doc = SimpleDocTemplate(output, pagesize=letter)
            elements = []
            styles = getSampleStyleSheet()
            
            if report_id == 'vat-return':
                period = data.get('period', {})
                elements.append(Paragraph("VAT Return Report", styles['Title']))
                elements.append(Paragraph(f"From: {period.get('start_date')} To: {period.get('end_date')}", styles['Normal']))
                elements.append(Spacer(1, 20))
                
                table_data = [
                    ['SUMMARY', ''],
                    ['Output Tax', str(data.get('output_tax', 0))],
                    ['Input Tax', str(data.get('input_tax', 0))],
                    ['Net Liability', str(data.get('vat_liability', 0))],
                    ['', ''],
                    ['DETAILED CATEGORIES', ''],
                    ['Total Sales Gross', str(data.get('total_sales_gross', 0))],
                    ['Total Sales Net', str(data.get('total_sales_net', 0))],
                    ['Total Purchases Gross', str(data.get('total_purchases_gross', 0))],
                    ['Total Purchases Net', str(data.get('total_purchases_net', 0))]
                ]
                
                t = Table(table_data, colWidths=[200, 200])
                t.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (1, 0), colors.grey),
                    ('TEXTCOLOR', (0, 0), (1, 0), colors.whitesmoke),
                    ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                    ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                    ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
                    ('BACKGROUND', (0, 5), (1, 5), colors.grey),
                    ('TEXTCOLOR', (0, 5), (1, 5), colors.whitesmoke),
                    ('FONTNAME', (0, 5), (-1, 5), 'Helvetica-Bold'),
                    ('GRID', (0,0), (-1,-1), 1, colors.black)
                ]))
                
                elements.append(t)
            
            doc.build(elements)
            return output

        import csv
        writer = csv.writer(output)

        from apps.finance.reports import export_rows  # type: ignore
        rows = export_rows(report_id, data)
        if rows is not None:
            writer.writerows(rows)
        elif report_id == 'trial-balance':
            writer.writerow(['Trial Balance Report', f"Period: {data.get('period', '')}"])
            writer.writerow([])
            writer.writerow(['Account Code', 'Account Name', 'Debit', 'Credit'])
            for acc in data.get('accounts', []):
                writer.writerow([acc['code'], acc['name'], acc['total_debit'], acc['total_credit']])
            writer.writerow([])
            writer.writerow(['TOTALS', '', data.get('total_debit'), data.get('total_credit')])

        elif report_id == 'income-statement':
            writer.writerow(['Income Statement', f"From: {data.get('from_date')} To: {data.get('to_date')}"])
            writer.writerow([])
            writer.writerow(['REVENUE'])
            for item in data.get('revenue', []):
                writer.writerow([item['code'], item['name'], item['amount']])
            writer.writerow(['Total Revenue', '', data.get('total_revenue')])
            writer.writerow([])
            writer.writerow(['EXPENSES'])
            for item in data.get('expenses', []):
                writer.writerow([item['code'], item['name'], item['amount']])
            writer.writerow(['Total Expenses', '', data.get('total_expenses')])
            writer.writerow([])
            writer.writerow(['NET PROFIT', '', data.get('net_profit')])

        elif report_id == 'balance-sheet':
            writer.writerow(['Balance Sheet', f"As At: {data.get('as_at_date')}"])
            writer.writerow([])
            writer.writerow(['ASSETS'])
            for item in data.get('assets', []):
                writer.writerow([item['code'], item['name'], item['amount']])
            writer.writerow(['Total Assets', '', data.get('total_assets')])
            writer.writerow([])
            writer.writerow(['LIABILITIES'])
            for item in data.get('liabilities', []):
                writer.writerow([item['code'], item['name'], item['amount']])
            writer.writerow(['Total Liabilities', '', data.get('total_liabilities')])
            writer.writerow([])
            writer.writerow(['EQUITY'])
            for item in data.get('equity', []):
                writer.writerow([item['code'], item['name'], item['amount']])
            writer.writerow(['Total Equity', '', data.get('total_equity')])

        elif report_id == 'vat-return':
            period = data.get('period', {})
            writer.writerow(['VAT Return Report', f"From: {period.get('start_date')} To: {period.get('end_date')}"])
            writer.writerow([])
            writer.writerow(['SUMMARY'])
            writer.writerow(['Output Tax', data.get('output_tax')])
            writer.writerow(['Input Tax', data.get('input_tax')])
            writer.writerow(['Net Liability', data.get('vat_liability')])
            writer.writerow([])
            writer.writerow(['DETAILED CATEGORIES'])
            writer.writerow(['Total Sales Gross', data.get('total_sales_gross')])
            writer.writerow(['Total Sales Net', data.get('total_sales_net')])
            writer.writerow(['Total Purchases Gross', data.get('total_purchases_gross')])
            writer.writerow(['Total Purchases Net', data.get('total_purchases_net')])

        return output

# ─── AP Views ────────────────────────────────────────────────────────────────

from apps.finance.models import Supplier, SupplierInvoice, SupplierPayment  # type: ignore

class SupplierViewSet(SupplierStatementActions, InviteSupplierToPortalActions, viewsets.ModelViewSet):
    queryset = Supplier.objects.all().order_by('name')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'tax_number', 'email']
    ordering_fields = ['name', 'created_at']

    def get_serializer_class(self):
        from apps.finance.serializers import SupplierSerializer  # type: ignore
        return SupplierSerializer

    @action(detail=True, methods=['post'])
    def toggle_active(self, request, pk=None):
        supplier = self.get_object()
        supplier.is_active = not supplier.is_active
        supplier.save(update_fields=['is_active'])
        return Response({'is_active': supplier.is_active})

class SupplierInvoiceViewSet(RecordRulesMixin, ApprovalActions, InvoiceMatchActions, InvoiceSettlementActions, viewsets.ModelViewSet):
    queryset = SupplierInvoice.objects.select_related('supplier').prefetch_related('lines__expense_account', 'lines__tax_code')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'supplier']
    search_fields = ['invoice_number', 'reference']
    ordering_fields = ['invoice_date', 'due_date', 'invoice_number', 'reference']

    def get_serializer_class(self):
        from apps.finance.serializers import SupplierInvoiceSerializer  # type: ignore
        return SupplierInvoiceSerializer

    @action(detail=True, methods=['post'])
    def review_invoice(self, request, pk=None):
        """Move invoice from draft to reviewed."""
        invoice = self.get_object()
        if invoice.status != SupplierInvoice.InvoiceStatus.DRAFT:
            return Response({'error': 'Only draft invoices can be reviewed'}, status=status.HTTP_400_BAD_REQUEST)
        
        invoice.status = SupplierInvoice.InvoiceStatus.REVIEWED
        invoice.save(update_fields=['status'])
        return Response({'status': 'reviewed'})

    @action(detail=True, methods=['post'])
    def post_invoice(self, request, pk=None):
        invoice = self.get_object()
        if invoice.status != SupplierInvoice.InvoiceStatus.REVIEWED:
            return Response({'error': 'Invoices must be reviewed first before posting'}, status=status.HTTP_400_BAD_REQUEST)
            
        from apps.finance.services.accounting import AccountingService  # type: ignore
        service = AccountingService(user=request.user)
        try:
            approvals.ensure_approved(invoice)
            entry = service.post_supplier_invoice(invoice)
            invoice.status = SupplierInvoice.InvoiceStatus.POSTED
            invoice.journal_entry = entry
            invoice.save(update_fields=['status', 'journal_entry'])
            return Response({'status': 'posted', 'journal_reference': entry.reference})
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def update(self, request, *args, **kwargs):
        """Only draft invoices can be edited."""
        instance = self.get_object()
        if instance.status != SupplierInvoice.InvoiceStatus.DRAFT:
            return Response({'error': 'Only draft invoices can be edited'}, status=status.HTTP_400_BAD_REQUEST)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Only draft invoices can be deleted."""
        instance = self.get_object()
        if instance.status != SupplierInvoice.InvoiceStatus.DRAFT:
            return Response({'error': 'Only draft invoices can be deleted'}, status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

class SupplierPaymentViewSet(RecordRulesMixin, ApprovalActions, PaymentSettlementActions, viewsets.ModelViewSet):
    queryset = SupplierPayment.objects.select_related('supplier', 'bank_account')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'supplier']
    search_fields = ['payment_reference']
    ordering_fields = ['payment_date', 'amount', 'payment_reference']

    def get_serializer_class(self):
        from apps.finance.serializers import SupplierPaymentSerializer  # type: ignore
        return SupplierPaymentSerializer

    @action(detail=True, methods=['post'])
    def post_payment(self, request, pk=None):
        payment = self.get_object()
        if payment.status != SupplierPayment.PaymentStatus.DRAFT:
            return Response({'error': 'Only draft payments can be posted'}, status=400)
            
        from apps.finance.services.accounting import AccountingService  # type: ignore
        service = AccountingService(user=request.user)
        try:
            approvals.ensure_approved(payment)
            allocations = parse_allocations(request.data, SupplierInvoice) if request.data.get('allocations') else None
            entry = service.post_supplier_payment(payment, allocations=allocations)
            payment.status = SupplierPayment.PaymentStatus.POSTED
            payment.journal_entry = entry
            payment.save(update_fields=['status', 'journal_entry'])
            return Response({'status': 'posted', 'journal_reference': entry.reference})
        except Exception as e:
            return Response({'error': str(e)}, status=400)

# ─── AR Views ────────────────────────────────────────────────────────────────

from apps.finance.models import CustomerProfile, CustomerInvoice, CustomerReceipt  # type: ignore

class CustomerProfileViewSet(CustomerStatementActions, viewsets.ModelViewSet):
    queryset = CustomerProfile.objects.select_related('contact_link', 'ar_account').order_by('name')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['is_active']
    search_fields = ['name', 'contact_link__first_name', 'contact_link__last_name']

    def get_serializer_class(self):
        from apps.finance.serializers import CustomerProfileSerializer  # type: ignore
        return CustomerProfileSerializer

class CustomerInvoiceViewSet(RecordRulesMixin, InvoiceSettlementActions, viewsets.ModelViewSet):
    queryset = CustomerInvoice.objects.select_related('customer').prefetch_related('lines__revenue_account', 'lines__tax_code')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'customer']
    search_fields = ['invoice_number', 'reference']
    ordering_fields = ['invoice_date', 'due_date', 'invoice_number', 'reference']

    def get_serializer_class(self):
        from apps.finance.serializers import CustomerInvoiceSerializer  # type: ignore
        return CustomerInvoiceSerializer

    @action(detail=True, methods=['post'])
    def post_invoice(self, request, pk=None):
        invoice = self.get_object()
        if invoice.status != CustomerInvoice.InvoiceStatus.DRAFT:
            return Response({'error': 'Only draft invoices can be posted'}, status=400)
            
        from apps.finance.services.accounting import AccountingService  # type: ignore
        service = AccountingService(user=request.user)
        try:
            entry = service.post_customer_invoice(invoice)
            invoice.status = CustomerInvoice.InvoiceStatus.POSTED
            invoice.journal_entry = entry
            invoice.save(update_fields=['status', 'journal_entry'])
            return Response({'status': 'posted', 'journal_reference': entry.reference})
        except Exception as e:
            return Response({'error': str(e)}, status=400)

    @action(detail=True, methods=['post'])
    def email_invoice(self, request, pk=None):
        invoice = self.get_object()
        from apps.finance.services.email_service import EmailService  # type: ignore
        
        success = EmailService.send_customer_invoice(invoice)
        if success:
            return Response({'status': 'sent', 'message': f'Invoice emailed to {invoice.customer.email}'})
        else:
            return Response({'error': 'Failed to send email. Check that the customer has an email address.'}, status=400)

    @action(detail=True, methods=['get'])
    def pdf(self, request, pk=None):
        from apps.finance.services.pdf_service import generate_invoice_pdf  # type: ignore

        invoice = self.get_object()
        response = HttpResponse(generate_invoice_pdf(invoice), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{invoice.invoice_number}.pdf"'
        return response

class CustomerReceiptViewSet(RecordRulesMixin, ReceiptSettlementActions, viewsets.ModelViewSet):
    queryset = CustomerReceipt.objects.select_related('customer', 'bank_account')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'customer']
    search_fields = ['receipt_reference']
    ordering_fields = ['receipt_date', 'amount', 'receipt_reference']

    def get_serializer_class(self):
        from apps.finance.serializers import CustomerReceiptSerializer  # type: ignore
        return CustomerReceiptSerializer

    @action(detail=True, methods=['post'])
    def post_receipt(self, request, pk=None):
        receipt = self.get_object()
        if receipt.status != CustomerReceipt.ReceiptStatus.DRAFT:
            return Response({'error': 'Only draft receipts can be posted'}, status=400)
            
        from apps.finance.services.accounting import AccountingService  # type: ignore
        service = AccountingService(user=request.user)
        try:
            allocations = parse_allocations(request.data, CustomerInvoice) if request.data.get('allocations') else None
            entry = service.post_customer_receipt(receipt, allocations=allocations)
            receipt.status = CustomerReceipt.ReceiptStatus.POSTED
            receipt.journal_entry = entry
            receipt.save(update_fields=['status', 'journal_entry'])
            return Response({'status': 'posted', 'journal_reference': entry.reference})
        except Exception as e:
            return Response({'error': str(e)}, status=400)

# ─── Bank & Tax Views ────────────────────────────────────────────────────────

from apps.finance.models import BankAccount, TaxCode  # type: ignore

class BankAccountViewSet(viewsets.ModelViewSet):
    queryset = BankAccount.objects.select_related('gl_account').order_by('name')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'account_type']
    search_fields = ['name', 'account_number', 'bank_name']
    ordering_fields = ['name', 'account_number', 'gl_account__current_balance']
    
    def get_serializer_class(self):
        from apps.finance.serializers import BankAccountSerializer  # type: ignore
        return BankAccountSerializer

class TaxCodeViewSet(viewsets.ModelViewSet):
    queryset = TaxCode.objects.all().order_by('code')
    
    def get_serializer_class(self):
        from apps.finance.serializers import TaxCodeSerializer  # type: ignore
        return TaxCodeSerializer


class JournalLineViewSet(viewsets.ReadOnlyModelViewSet):
    """View and filter individual debits/credits (transactions)."""
    queryset = JournalLine.objects.select_related('entry', 'account', 'entry__journal').order_by('-entry__entry_date', '-entry__created_at')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['account', 'side', 'entry__status']
    search_fields = ['description', 'entry__reference', 'account__name', 'account__code']

    def get_serializer_class(self):
        from apps.finance.serializers import JournalLineSerializer  # type: ignore
        return JournalLineSerializer

class VATReturnView(APIView):
    """Generate VAT Return for a date range."""

    def get(self, request):
        from_date = request.query_params.get('from_date')
        to_date = request.query_params.get('to_date')
        
        from apps.finance.services.tax_service import TaxService  # type: ignore
        try:
            from datetime import datetime
            fd = datetime.strptime(from_date, '%Y-%m-%d').date()
            td = datetime.strptime(to_date, '%Y-%m-%d').date()
            data = TaxService.generate_vat_return(fd, td)
            return Response(data)
        except Exception as e:
            return Response({'error': str(e)}, status=400)


class FinanceSummaryView(APIView):
    """Provides high-level financial KPIs for the dashboard and finance module."""

    def get(self, request):
        from apps.finance.models import ChartOfAccount, JournalLine, JournalEntry
        from apps.rentals.models import RentalInvoice

        # 1. Cash Position: Sum of all Bank accounts
        cash_position = ChartOfAccount.objects.filter(
            account_sub_type='bank', is_active=True
        ).aggregate(total=Sum('current_balance'))['total'] or Decimal('0')

        # 2. Accounts Receivable: Sum of all Receivable accounts
        ar_total = ChartOfAccount.objects.filter(
            account_sub_type='receivable', is_active=True
        ).aggregate(total=Sum('current_balance'))['total'] or Decimal('0')

        # 3. Overdue Count
        overdue_count = RentalInvoice.objects.filter(status='overdue').count()

        # 4. Operating Margin: (Revenue - Expenses) / Revenue
        revenue = JournalLine.objects.filter(
            entry__status__in=JournalEntry.LEDGER_STATUSES,
            account__account_type='revenue'
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
        
        expenses = JournalLine.objects.filter(
            entry__status__in=JournalEntry.LEDGER_STATUSES,
            account__account_type='expense'
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        operating_margin = 0
        if revenue > 0:
            operating_margin = round(((revenue - expenses) / revenue) * 100, 1)

        return Response({
            'cash_position': str(cash_position),
            'accounts_receivable': str(ar_total),
            'overdue_count': overdue_count,
            'operating_margin': operating_margin,
            'operating_target': 35.0,
        })
