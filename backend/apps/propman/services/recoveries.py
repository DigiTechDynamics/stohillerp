"""
Operating-cost recoveries.

Each month a participating lease is billed on account: the schedule's budget
x recoverable % / 12 x the lease's share. At year end the actual cost (GL
expense accounts tagged with the property) is compared with what was billed
and each tenant receives an invoice or a credit note for the difference.

Shares: area basis = the lease's unit floor area / total area of the units
of the leases in the schedule; percent basis = the share's percent; equal
basis = 1 / number of leases.
"""

from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Q, Sum

from apps.finance.models import ChartOfAccount, CustomerInvoice, CustomerInvoiceLine, JournalEntry, JournalLine
from apps.finance.services.accounting import AccountingError, AccountingService
from apps.propman.models import RecoveryReconciliation, RecoverySchedule

ZERO = Decimal('0.00')
CENT = Decimal('0.01')


def shares_for(schedule: RecoverySchedule) -> dict:
    """{lease_id: fraction} for the schedule's participating leases."""
    shares = list(schedule.shares.select_related('lease__unit'))
    if not shares:
        return {}
    if schedule.basis == RecoverySchedule.Basis.PERCENT:
        return {s.lease_id: (s.percent or ZERO) / 100 for s in shares}
    if schedule.basis == RecoverySchedule.Basis.EQUAL:
        return {s.lease_id: Decimal('1') / len(shares) for s in shares}
    areas = {s.lease_id: (s.lease.unit.floor_size if s.lease.unit_id and s.lease.unit.floor_size else ZERO)
             for s in shares}
    total = sum(areas.values(), ZERO)
    if not total:
        raise AccountingError(f'"{schedule.name}" is apportioned by area, but none of its leases has a unit '
                              f'with a floor area.')
    return {lease_id: area / total for lease_id, area in areas.items()}


def recovery_charge_lines(lease, period_start, factor, vat_rate):
    lines = []
    for share in lease.recovery_shares.select_related('schedule__property', 'schedule__income_account') \
            .filter(schedule__is_active=True, schedule__year_start__lte=period_start):
        schedule = share.schedule
        fraction = shares_for(schedule).get(lease.pk, ZERO)
        monthly = schedule.effective_budget * schedule.recoverable_percent / 100 / 12
        amount = (monthly * fraction * factor).quantize(CENT)
        if amount <= 0:
            continue
        vat = (amount * vat_rate).quantize(CENT) if schedule.vat_applicable else Decimal('0.00')
        lines.append({'description': f'{schedule.name} (on account, {(fraction * 100).quantize(Decimal("0.01"))}%)',
                      'account_code': schedule.income_account.code if schedule.income_account_id else '4920',
                      'amount': str(amount), 'vat': str(vat), 'source': f'recovery:{schedule.pk}'})
    return lines


def actual_cost(schedule, date_from, date_to) -> Decimal:
    accounts = list(schedule.expense_accounts.values_list('pk', flat=True))
    if not accounts:
        return ZERO
    agg = JournalLine.objects.filter(
        account_id__in=accounts, property_ref=schedule.property,
        entry__status__in=JournalEntry.LEDGER_STATUSES, entry__entry_date__range=(date_from, date_to),
    ).aggregate(dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
    return ((agg['dr'] or ZERO) - (agg['cr'] or ZERO)).quantize(CENT)


def billed_on_account(schedule, lease, date_from, date_to) -> Decimal:
    from apps.rentals.models import RentalInvoice

    tag, total = f'recovery:{schedule.pk}', ZERO
    for invoice in RentalInvoice.objects.filter(lease=lease, period_start__range=(date_from, date_to)) \
            .exclude(status=RentalInvoice.InvoiceStatus.CANCELLED):
        total += sum((Decimal(c['amount']) for c in invoice.charges or [] if c.get('source') == tag), ZERO)
    return total


def reconciliation_preview(schedule, date_from, date_to) -> dict:
    cost = actual_cost(schedule, date_from, date_to)
    recoverable = (cost * schedule.recoverable_percent / 100).quantize(CENT)
    shares = shares_for(schedule)
    lines, billed_total = [], ZERO
    for share in schedule.shares.select_related('lease__tenant'):
        lease = share.lease
        due = (recoverable * shares.get(lease.pk, ZERO)).quantize(CENT)
        billed = billed_on_account(schedule, lease, date_from, date_to)
        billed_total += billed
        lines.append({'lease': str(lease.pk), 'lease_number': lease.lease_number,
                      'tenant': lease.tenant.full_name if lease.tenant_id else '',
                      'share': str((shares.get(lease.pk, ZERO) * 100).quantize(Decimal('0.01'))),
                      'due': str(due), 'billed': str(billed), 'difference': str(due - billed), 'document': None})
    return {'actual_cost': cost, 'recoverable_cost': recoverable, 'billed_on_account': billed_total, 'lines': lines}


@transaction.atomic
def reconcile(schedule: RecoverySchedule, date_from, date_to, post=False, user=None) -> RecoveryReconciliation:
    """Compare and, with post=True, invoice under-recoveries and credit over-recoveries."""
    from apps.rentals.models import Lease
    from apps.rentals.services.finance_sync import RentalFinanceSyncService

    if RecoveryReconciliation.objects.filter(schedule=schedule, period_start=date_from, period_end=date_to,
                                             posted=True).exists():
        raise AccountingError('This period has already been reconciled and posted.')
    data = reconciliation_preview(schedule, date_from, date_to)
    income = schedule.income_account or ChartOfAccount.objects.get(code='4920')
    if post:
        for line in data['lines']:
            difference = Decimal(line['difference'])
            if difference == 0:
                continue
            lease = Lease.objects.select_related('tenant').get(pk=line['lease'])
            customer = RentalFinanceSyncService.sync_tenant_to_customer(lease.tenant)
            credit = difference < 0
            amount = abs(difference)
            doc = CustomerInvoice.objects.create(
                customer=customer, invoice_date=date_to, due_date=date_to + timedelta(days=lease.payment_due_days),
                currency=lease.currency, reference=f'{schedule.name} reconciliation {date_from}–{date_to}',
                document_type=CustomerInvoice.DocumentType.CREDIT_NOTE if credit else CustomerInvoice.DocumentType.INVOICE,
                subtotal=amount, total_amount=amount)
            CustomerInvoiceLine.objects.create(
                invoice=doc, description=f'{schedule.name}: year-end {"over" if credit else "under"}-recovery',
                revenue_account=income, unit_price=amount, line_total=amount, property_ref=schedule.property)
            entry = AccountingService(user=user).post_customer_invoice(doc)
            doc.status, doc.journal_entry = CustomerInvoice.InvoiceStatus.POSTED, entry
            doc.save(update_fields=['status', 'journal_entry'])
            line['document'] = doc.invoice_number
    return RecoveryReconciliation.objects.create(
        schedule=schedule, period_start=date_from, period_end=date_to, actual_cost=data['actual_cost'],
        recoverable_cost=data['recoverable_cost'], billed_on_account=data['billed_on_account'],
        lines=data['lines'], posted=post, created_by=user)
