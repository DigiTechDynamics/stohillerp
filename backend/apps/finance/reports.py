"""
Management reports: AR/AP aging, general-ledger account detail, and budget vs
actual (with the BudgetLine API it needs).

These are the standard sub-ledger and control reports in Business Central,
Odoo and Sage Evolution that the Reports page listed but the API never had.
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from django.db.models import Q, Sum
from django.utils import timezone
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.finance.models import (
    BudgetLine, ChartOfAccount, CustomerInvoice, FiscalYear, JournalEntry, JournalLine, SupplierInvoice,
)

ZERO = Decimal('0.00')
AGING_BUCKETS = [
    ('current', 'Current', None, 0),
    ('1_30', '1-30 days', 1, 30),
    ('31_60', '31-60 days', 31, 60),
    ('61_90', '61-90 days', 61, 90),
    ('over_90', 'Over 90 days', 91, None),
]


def _parse_date(value, default=None):
    if not value:
        return default
    return date.fromisoformat(value)


def _bucket(days_overdue):
    for key, _label, low, high in AGING_BUCKETS:
        if (low is None or days_overdue >= low) and (high is None or days_overdue <= high):
            return key
    return 'over_90'


class AgingReportView(APIView):
    """
    Open invoices by days past due, grouped by customer (AR) or supplier (AP).

    GET finance/reports/ar-aging/?as_at_date=YYYY-MM-DD
    GET finance/reports/ap-aging/?as_at_date=YYYY-MM-DD

    Balances are current settled amounts; invoices raised after as_at_date are
    excluded. Buckets are by due date.
    """
    kind = 'ar'

    def get(self, request):
        try:
            as_at = _parse_date(request.query_params.get('as_at_date'), timezone.localdate())
        except ValueError:
            return Response({'error': 'as_at_date must be YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.build(as_at))

    def build(self, as_at):
        if self.kind == 'ar':
            model, party_field, open_statuses = CustomerInvoice, 'customer', [
                CustomerInvoice.InvoiceStatus.POSTED, CustomerInvoice.InvoiceStatus.PARTIAL,
                CustomerInvoice.InvoiceStatus.OVERDUE]
        else:
            model, party_field, open_statuses = SupplierInvoice, 'supplier', [
                SupplierInvoice.InvoiceStatus.POSTED, SupplierInvoice.InvoiceStatus.PARTIAL]

        invoices = model.objects.filter(status__in=open_statuses, invoice_date__lte=as_at) \
            .select_related(party_field, 'currency').order_by('due_date')

        parties = {}
        totals = defaultdict(lambda: ZERO)

        def party_row(party):
            return parties.setdefault(party.pk, {
                'id': str(party.pk), 'name': str(party),
                **{b[0]: ZERO for b in AGING_BUCKETS}, 'unapplied': ZERO, 'total': ZERO, 'invoices': [],
            })

        # Open credit notes and cash not yet applied reduce what is owed but
        # aren't aged: they're shown as a separate (negative) column.
        for credit, party in self._unapplied_credits(as_at):
            row = party_row(party)
            row['unapplied'] -= credit
            row['total'] -= credit
            totals['unapplied'] -= credit
            totals['total'] -= credit

        for inv in invoices:
            if inv.is_credit_note:
                continue
            balance = inv.total_amount - inv.amount_paid
            if balance <= 0:
                continue
            days = (as_at - inv.due_date).days
            key = _bucket(days)
            row = party_row(getattr(inv, party_field))
            row[key] += balance
            row['total'] += balance
            totals[key] += balance
            totals['total'] += balance
            row['invoices'].append({
                'invoice_number': inv.invoice_number,
                'invoice_date': inv.invoice_date.isoformat(),
                'due_date': inv.due_date.isoformat(),
                'days_overdue': max(days, 0),
                'bucket': key,
                'balance': str(balance),
                'currency': inv.currency.code if inv.currency else None,
            })

        keys = [b[0] for b in AGING_BUCKETS] + ['unapplied', 'total']
        rows = sorted(parties.values(), key=lambda r: r['total'], reverse=True)
        for row in rows:
            for k in keys:
                row[k] = str(row[k])
        return {
            'report': f'{self.kind}_aging',
            'as_at_date': as_at.isoformat(),
            'buckets': [{'key': k, 'label': label} for k, label, _lo, _hi in AGING_BUCKETS],
            'rows': rows,
            'totals': {k: str(totals[k]) for k in keys},
        }

    def _unapplied_credits(self, as_at):
        """(amount, party) for open credit notes and unapplied receipts/payments."""
        from apps.finance.models import CustomerReceipt, SupplierPayment

        if self.kind == 'ar':
            notes = CustomerInvoice.objects.filter(
                document_type=CustomerInvoice.DocumentType.CREDIT_NOTE, invoice_date__lte=as_at,
                status__in=[CustomerInvoice.InvoiceStatus.POSTED, CustomerInvoice.InvoiceStatus.PARTIAL],
            ).select_related('customer')
            cash = CustomerReceipt.objects.filter(unapplied_amount__gt=0, receipt_date__lte=as_at,
                                                  status=CustomerReceipt.ReceiptStatus.POSTED).select_related('customer')
            return [(n.balance_due, n.customer) for n in notes] + [(c.unapplied_amount, c.customer) for c in cash]
        notes = SupplierInvoice.objects.filter(
            document_type=SupplierInvoice.DocumentType.CREDIT_NOTE, invoice_date__lte=as_at,
            status__in=[SupplierInvoice.InvoiceStatus.POSTED, SupplierInvoice.InvoiceStatus.PARTIAL],
        ).select_related('supplier')
        cash = SupplierPayment.objects.filter(unapplied_amount__gt=0, payment_date__lte=as_at,
                                              status=SupplierPayment.PaymentStatus.POSTED).select_related('supplier')
        return [(n.balance_due, n.supplier) for n in notes] + [(c.unapplied_amount, c.supplier) for c in cash]


class GeneralLedgerView(APIView):
    """
    Account detail with opening balance and running balance.

    GET finance/reports/general-ledger/?account=1010&from_date=...&to_date=...
    Balances are signed to the account's normal side (debit for assets and
    expenses, credit for liabilities, equity and revenue).
    """

    def get(self, request):
        code = request.query_params.get('account')
        try:
            from_date = _parse_date(request.query_params.get('from_date'))
            to_date = _parse_date(request.query_params.get('to_date'), timezone.localdate())
        except ValueError:
            return Response({'error': 'Dates must be YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        if not code or not from_date:
            return Response({'error': 'account and from_date are required'}, status=status.HTTP_400_BAD_REQUEST)
        account = ChartOfAccount.objects.filter(code=code).first()
        if not account:
            return Response({'error': f'Account {code} not found'}, status=status.HTTP_404_NOT_FOUND)

        sign = Decimal('1') if account.normal_balance == 'debit' else Decimal('-1')
        ledger = JournalLine.objects.filter(account=account, entry__status__in=JournalEntry.LEDGER_STATUSES)
        if request.query_params.get('cost_center'):
            ledger = ledger.filter(cost_center_id=request.query_params['cost_center'])
        if request.query_params.get('property_id'):
            ledger = ledger.filter(property_ref_id=request.query_params['property_id'])

        opening = ledger.filter(entry__entry_date__lt=from_date).aggregate(
            dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
        balance = ((opening['dr'] or ZERO) - (opening['cr'] or ZERO)) * sign
        opening_balance = balance

        lines = []
        total_dr = total_cr = ZERO
        for line in ledger.filter(entry__entry_date__range=(from_date, to_date)) \
                .select_related('entry', 'entry__journal') \
                .order_by('entry__entry_date', 'entry__posted_at', 'entry__reference'):
            dr = line.amount if line.side == 'debit' else ZERO
            cr = line.amount if line.side == 'credit' else ZERO
            total_dr += dr
            total_cr += cr
            balance += (dr - cr) * sign
            lines.append({
                'date': line.entry.entry_date.isoformat(),
                'reference': line.entry.reference,
                'journal': line.entry.journal.code,
                'description': line.description or line.entry.description,
                'source': line.entry.source_module,
                'debit': str(dr), 'credit': str(cr), 'balance': str(balance),
            })

        return Response({
            'account': {'code': account.code, 'name': account.name, 'type': account.account_type,
                        'normal_balance': account.normal_balance},
            'from_date': from_date.isoformat(), 'to_date': to_date.isoformat(),
            'opening_balance': str(opening_balance),
            'lines': lines,
            'total_debit': str(total_dr), 'total_credit': str(total_cr),
            'closing_balance': str(balance),
        })


class BudgetVsActualView(APIView):
    """
    Budget vs actual per P&L account for a fiscal year (or one period).

    GET finance/reports/budget-vs-actual/?fiscal_year=<id>[&period=<id>]
    Variance is actual - budget; for expenses a positive variance is overspend.
    Year-end closing entries are excluded from actuals.
    """

    def get(self, request):
        fy_id = request.query_params.get('fiscal_year')
        fy = FiscalYear.objects.filter(pk=fy_id).first() if fy_id else \
            FiscalYear.objects.filter(start_date__lte=timezone.localdate(),
                                      end_date__gte=timezone.localdate()).first()
        if not fy:
            return Response({'error': 'fiscal_year not found'}, status=status.HTTP_404_NOT_FOUND)

        budgets = BudgetLine.objects.filter(fiscal_period__fiscal_year=fy)
        actuals = JournalLine.objects.filter(
            entry__status__in=JournalEntry.LEDGER_STATUSES,
            entry__fiscal_period__fiscal_year=fy,
            account__account_type__in=['revenue', 'expense'],
        ).exclude(entry__source_module='year_end')
        period_id = request.query_params.get('period')
        if period_id:
            budgets = budgets.filter(fiscal_period_id=period_id)
            actuals = actuals.filter(entry__fiscal_period_id=period_id)

        budget_by_acct = {r['account_id']: r['total'] for r in
                          budgets.values('account_id').annotate(total=Sum('budgeted_amount'))}
        actual_by_acct = {r['account_id']: r for r in actuals.values('account_id').annotate(
            dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))}

        accounts = ChartOfAccount.objects.filter(pk__in=set(budget_by_acct) | set(actual_by_acct)).order_by('code')
        rows = []
        totals = {'revenue': [ZERO, ZERO], 'expense': [ZERO, ZERO]}
        for acct in accounts:
            a = actual_by_acct.get(acct.pk, {})
            dr, cr = a.get('dr') or ZERO, a.get('cr') or ZERO
            actual = (cr - dr) if acct.account_type == 'revenue' else (dr - cr)
            budget = budget_by_acct.get(acct.pk) or ZERO
            variance = actual - budget
            totals[acct.account_type][0] += budget
            totals[acct.account_type][1] += actual
            rows.append({
                'code': acct.code, 'name': acct.name, 'type': acct.account_type,
                'budget': str(budget), 'actual': str(actual), 'variance': str(variance),
                'variance_pct': str((variance / budget * 100).quantize(Decimal('0.1'))) if budget else None,
            })

        return Response({
            'fiscal_year': {'id': str(fy.pk), 'name': fy.name},
            'period': period_id,
            'rows': rows,
            'totals': {
                t: {'budget': str(b), 'actual': str(a), 'variance': str(a - b)} for t, (b, a) in totals.items()
            },
            'net_profit': {
                'budget': str(totals['revenue'][0] - totals['expense'][0]),
                'actual': str(totals['revenue'][1] - totals['expense'][1]),
            },
        })


class BudgetLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    period_name = serializers.CharField(source='fiscal_period.name', read_only=True)

    class Meta:
        model = BudgetLine
        fields = ['id', 'fiscal_period', 'period_name', 'account', 'account_code', 'account_name',
                  'budgeted_amount', 'notes']

    def validate_account(self, account):
        if account.account_type not in ('revenue', 'expense'):
            raise serializers.ValidationError('Budgets apply to revenue and expense accounts.')
        return account


class BudgetLineViewSet(viewsets.ModelViewSet):
    queryset = BudgetLine.objects.select_related('account', 'fiscal_period').order_by(
        'fiscal_period__start_date', 'account__code')
    serializer_class = BudgetLineSerializer
    filterset_fields = ['fiscal_period', 'fiscal_period__fiscal_year', 'account']


# ─── CSV export rows (used by ReportExportView) ───────────────────────────────

def export_rows(report_id, data):
    """Flatten one of the reports above into CSV rows, or None if not ours."""
    if report_id in ('ar-aging', 'ap-aging'):
        keys = [b['key'] for b in data['buckets']] + ['unapplied', 'total']
        rows = [[report_id.upper(), f"As at {data['as_at_date']}"], [],
                ['Name'] + [b['label'] for b in data['buckets']] + ['Unapplied credits', 'Total']]
        rows += [[r['name']] + [r[k] for k in keys] for r in data['rows']]
        rows += [[], ['TOTAL'] + [data['totals'][k] for k in keys]]
        return rows
    if report_id == 'general-ledger':
        acct = data['account']
        rows = [[f"General Ledger {acct['code']} {acct['name']}", f"{data['from_date']} to {data['to_date']}"], [],
                ['Date', 'Reference', 'Journal', 'Description', 'Debit', 'Credit', 'Balance'],
                ['', '', '', 'Opening balance', '', '', data['opening_balance']]]
        rows += [[ln['date'], ln['reference'], ln['journal'], ln['description'], ln['debit'], ln['credit'],
                  ln['balance']] for ln in data['lines']]
        rows += [['', '', '', 'Closing balance', data['total_debit'], data['total_credit'], data['closing_balance']]]
        return rows
    if report_id == 'cash-flow':
        rows = [['Cash Flow Statement', f"{data['from_date']} to {data['to_date']}"], [],
                ['Opening cash', data['opening_cash']], [], ['OPERATING ACTIVITIES'],
                ['', 'Net profit', data['net_profit']]]
        for section, total in (('operating', 'net_cash_from_operating'), ('investing', 'net_cash_from_investing'),
                               ('financing', 'net_cash_from_financing')):
            if section != 'operating':
                rows += [[], [f'{section.upper()} ACTIVITIES']]
            rows += [[r['code'], r['name'], r['amount']] for r in data[section]]
            rows += [['', f'Net cash from {section}', data[total]]]
        rows += [[], ['Net change in cash', '', data['net_change_in_cash']], ['Closing cash', '', data['closing_cash']]]
        return rows
    if report_id == 'budget-vs-actual':
        rows = [['Budget vs Actual', data['fiscal_year']['name']], [],
                ['Code', 'Account', 'Type', 'Budget', 'Actual', 'Variance', 'Variance %']]
        rows += [[r['code'], r['name'], r['type'], r['budget'], r['actual'], r['variance'], r['variance_pct'] or '']
                 for r in data['rows']]
        return rows
    return None


# ─── Cash-flow statement (indirect method) ────────────────────────────────────

INVESTING_SUBTYPES = {'fixed_asset', 'investment'}
FINANCING_SUBTYPES = {'long_term_liability', 'share_capital', 'retained_earnings'}


def _cash_flow_section(account):
    """Where a non-cash balance-sheet account's movement belongs."""
    if account['account__account_type'] == 'contra':
        return 'operating'          # accumulated depreciation: the add-back
    sub = account['account__account_sub_type']
    if sub in INVESTING_SUBTYPES:
        return 'investing'
    if sub in FINANCING_SUBTYPES or account['account__account_type'] == 'equity':
        return 'financing'
    return 'operating'              # working capital


class CashFlowView(APIView):
    """
    GET finance/reports/cash-flow/?from_date=&to_date=

    Net profit, then the period movement (credit - debit) of every non-cash
    balance-sheet account grouped into operating / investing / financing.
    Because every entry balances, the three sections always add up to the
    change in bank and cash; `reconciles` confirms it. Year-end closing
    entries are excluded (they only move P&L into retained earnings).
    """

    def get(self, request):
        try:
            from_date = _parse_date(request.query_params.get('from_date'))
            to_date = _parse_date(request.query_params.get('to_date'), timezone.localdate())
        except ValueError:
            return Response({'error': 'Dates must be YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        if not from_date:
            return Response({'error': 'from_date is required'}, status=status.HTTP_400_BAD_REQUEST)

        period = JournalLine.objects.filter(
            entry__status__in=JournalEntry.LEDGER_STATUSES, entry__entry_date__range=(from_date, to_date),
        ).exclude(entry__source_module='year_end')
        movements = period.values('account__code', 'account__name', 'account__account_type',
                                  'account__account_sub_type').annotate(
            dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))

        net_profit = ZERO
        cash_change = ZERO
        sections = {'operating': [], 'investing': [], 'financing': []}
        for m in movements:
            dr, cr = m['dr'] or ZERO, m['cr'] or ZERO
            kind = m['account__account_type']
            if kind in ('revenue', 'expense'):
                net_profit += cr - dr
            elif m['account__account_sub_type'] == 'bank':
                cash_change += dr - cr
            elif cr - dr != 0:
                sections[_cash_flow_section(m)].append(
                    {'code': m['account__code'], 'name': m['account__name'], 'amount': cr - dr})

        totals = {k: sum((row['amount'] for row in rows), ZERO) for k, rows in sections.items()}
        totals['operating'] += net_profit
        net_flow = totals['operating'] + totals['investing'] + totals['financing']
        opening_cash = JournalLine.objects.filter(
            entry__status__in=JournalEntry.LEDGER_STATUSES, entry__entry_date__lt=from_date,
            account__account_sub_type='bank',
        ).aggregate(dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
        opening = (opening_cash['dr'] or ZERO) - (opening_cash['cr'] or ZERO)

        def fmt(rows):
            return [{**r, 'amount': str(r['amount'])} for r in sorted(rows, key=lambda r: r['code'])]

        return Response({
            'from_date': from_date.isoformat(), 'to_date': to_date.isoformat(),
            'net_profit': str(net_profit),
            'operating': fmt(sections['operating']), 'investing': fmt(sections['investing']),
            'financing': fmt(sections['financing']),
            'net_cash_from_operating': str(totals['operating']),
            'net_cash_from_investing': str(totals['investing']),
            'net_cash_from_financing': str(totals['financing']),
            'net_change_in_cash': str(net_flow),
            'opening_cash': str(opening), 'closing_cash': str(opening + cash_change),
            'reconciles': net_flow == cash_change,
        })


# ─── Cost centres and recurring journals (APIs for existing models) ──────────

from apps.finance.models import CostCenter, RecurringJournal, RecurringJournalLine  # noqa: E402


class CostCenterSerializer(serializers.ModelSerializer):
    class Meta:
        model = CostCenter
        fields = ['id', 'code', 'name', 'property', 'is_active']


class CostCenterViewSet(viewsets.ModelViewSet):
    queryset = CostCenter.objects.order_by('code')
    serializer_class = CostCenterSerializer
    filterset_fields = ['is_active', 'property']


class RecurringJournalLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)

    class Meta:
        model = RecurringJournalLine
        fields = ['id', 'account', 'account_code', 'side', 'amount', 'description', 'cost_center', 'property_ref']


class RecurringJournalSerializer(serializers.ModelSerializer):
    lines = RecurringJournalLineSerializer(many=True)

    class Meta:
        model = RecurringJournal
        fields = ['id', 'name', 'description', 'journal', 'frequency', 'next_run_date', 'end_date', 'auto_post',
                  'reverse_next_period', 'is_active', 'last_run_date', 'lines']
        read_only_fields = ['last_run_date']

    def validate_lines(self, lines):
        dr = sum((ln['amount'] for ln in lines if ln['side'] == 'debit'), ZERO)
        cr = sum((ln['amount'] for ln in lines if ln['side'] == 'credit'), ZERO)
        if not lines or dr != cr or dr <= 0:
            raise serializers.ValidationError(f'Lines must balance and be non-zero (Dr {dr} / Cr {cr}).')
        return lines

    def _save_lines(self, template, lines):
        template.lines.all().delete()
        RecurringJournalLine.objects.bulk_create([RecurringJournalLine(template=template, **ln) for ln in lines])

    def create(self, validated_data):
        lines = validated_data.pop('lines')
        template = RecurringJournal.objects.create(**validated_data)
        self._save_lines(template, lines)
        return template

    def update(self, instance, validated_data):
        lines = validated_data.pop('lines', None)
        instance = super().update(instance, validated_data)
        if lines is not None:
            self._save_lines(instance, lines)
        return instance


class RecurringJournalViewSet(viewsets.ModelViewSet):
    queryset = RecurringJournal.objects.select_related('journal').prefetch_related('lines__account')
    serializer_class = RecurringJournalSerializer
    filterset_fields = ['is_active', 'frequency']

    @action(detail=False, methods=['post'])
    def run_due(self, request):
        """Generate everything due today (the daily job does this automatically)."""
        from apps.finance.services.recurring import run_recurring_journals
        return Response({'result': run_recurring_journals(timezone.localdate(), request.user)})