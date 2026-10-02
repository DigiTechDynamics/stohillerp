"""
Arrears collections.

run_arrears() (daily) opens a case for every lease with overdue rent,
keeps its amount and age up to date, moves it to the next ArrearsStage when
the oldest debt reaches the stage's age, and sends the stage's email/SMS.
A promise to pay holds escalation until the promised date. A case closes as
settled when nothing is overdue any more. Legal handover is recorded by
staff (attorney, reference) once the "legal" stage is reached.
"""

from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Min, Sum
from django.utils import timezone

from apps.finance.services.accounting import AccountingError
from apps.notifications.services import notify_contact
from apps.propman.models import ArrearsAction, ArrearsCase, ArrearsStage

ZERO = Decimal('0.00')
OPEN_CASE = [ArrearsCase.Status.OPEN, ArrearsCase.Status.PROMISE, ArrearsCase.Status.LEGAL]


def overdue_for(lease, today):
    from apps.rentals.models import RentalInvoice

    qs = RentalInvoice.objects.filter(lease=lease, balance_due__gt=0, due_date__lt=today) \
        .exclude(status__in=[RentalInvoice.InvoiceStatus.DRAFT, RentalInvoice.InvoiceStatus.CANCELLED])
    agg = qs.aggregate(total=Sum('balance_due'), oldest=Min('due_date'))
    return agg['total'] or ZERO, agg['oldest']


def render(template, lease, amount, days):
    return template.format(
        tenant=lease.tenant.full_name if lease.tenant_id else 'Tenant', lease=lease.lease_number,
        property=lease.property.name, amount=f'{amount:,.2f}',
        currency=lease.currency.code if lease.currency_id else settings.COMPANY_CONFIG.get('currency', ''),
        days=days, company=settings.COMPANY_CONFIG.get('name', ''))


def send_stage(case, stage, user=None):
    lease = case.lease
    days = (timezone.localdate() - case.oldest_due_date).days if case.oldest_due_date else 0
    channels = [c for c, on in (('email', stage.send_email), ('sms', stage.send_sms)) if on]
    messages = notify_contact(lease.tenant, render(stage.subject, lease, case.amount_overdue, days),
                              render(stage.template, lease, case.amount_overdue, days), channels=channels,
                              category='arrears', related=f'lease:{lease.lease_number}', user=user) \
        if channels and lease.tenant_id else []
    action = ArrearsAction.objects.create(case=case, stage=stage, action=stage.action, created_by=user,
                                          amount_overdue=case.amount_overdue,
                                          description=f'{stage.name} ({days} days overdue)')
    action.messages.set(messages)
    case.stage = stage
    case.save(update_fields=['stage', 'updated_at'])
    return action


@transaction.atomic
def run_arrears(today=None, user=None) -> str:
    from apps.rentals.models import Lease

    today = today or timezone.localdate()
    stages = list(ArrearsStage.objects.filter(is_active=True).order_by('sequence'))
    opened = escalated = settled = 0
    leases = Lease.objects.filter(invoices__balance_due__gt=0, invoices__due_date__lt=today).distinct() \
        .select_related('tenant', 'property', 'currency')
    seen = set()
    for lease in leases:
        amount, oldest = overdue_for(lease, today)
        if amount <= 0:
            continue
        seen.add(lease.pk)
        case = ArrearsCase.objects.filter(lease=lease, status__in=OPEN_CASE).first()
        if case is None:
            case = ArrearsCase.objects.create(lease=lease, opened_on=today, amount_overdue=amount,
                                              oldest_due_date=oldest, created_by=user)
            opened += 1
        else:
            case.amount_overdue, case.oldest_due_date = amount, oldest
            case.save(update_fields=['amount_overdue', 'oldest_due_date', 'updated_at'])
        if case.status == ArrearsCase.Status.PROMISE:
            if case.promise_date and case.promise_date >= today:
                continue          # waiting for the promised payment
            case.status = ArrearsCase.Status.OPEN    # promise broken
            case.save(update_fields=['status'])
            ArrearsAction.objects.create(case=case, action='note', amount_overdue=amount,
                                         description=f'Promise to pay by {case.promise_date} was not kept.')
        if case.status == ArrearsCase.Status.LEGAL:
            continue
        days = (today - oldest).days
        current = case.stage.sequence if case.stage_id else -1
        due = [s for s in stages if s.days_overdue <= days and s.sequence > current]
        if due:
            send_stage(case, due[-1], user)     # jump straight to the stage the age warrants
            escalated += 1
    # Cases with nothing overdue any more are settled.
    for case in ArrearsCase.objects.filter(status__in=OPEN_CASE).exclude(lease_id__in=seen):
        case.status, case.closed_on, case.amount_overdue = ArrearsCase.Status.SETTLED, today, ZERO
        case.save(update_fields=['status', 'closed_on', 'amount_overdue', 'updated_at'])
        ArrearsAction.objects.create(case=case, action='payment', description='Arrears cleared.')
        settled += 1
    return f'{opened} case(s) opened, {escalated} escalated, {settled} settled'


def record_promise(case, promise_date, amount, user=None, note=''):
    if case.status not in OPEN_CASE:
        raise AccountingError('This case is closed.')
    case.status, case.promise_date, case.promise_amount = ArrearsCase.Status.PROMISE, promise_date, amount
    case.save(update_fields=['status', 'promise_date', 'promise_amount', 'updated_at'])
    return ArrearsAction.objects.create(case=case, action='promise', amount_overdue=case.amount_overdue,
                                        created_by=user,
                                        description=f'Promised {amount} by {promise_date}. {note}'.strip())


def hand_over(case, attorney, reference='', user=None, note=''):
    if case.status not in OPEN_CASE:
        raise AccountingError('This case is closed.')
    if not attorney:
        raise AccountingError('Name the attorney the matter is handed to.')
    case.status, case.attorney, case.legal_reference = ArrearsCase.Status.LEGAL, attorney, reference
    case.handed_over_on = timezone.localdate()
    case.save(update_fields=['status', 'attorney', 'legal_reference', 'handed_over_on', 'updated_at'])
    return ArrearsAction.objects.create(case=case, action='legal', amount_overdue=case.amount_overdue, created_by=user,
                                        description=f'Handed over to {attorney} {reference}. {note}'.strip())


def send_rent_reminders(today=None) -> str:
    """Email (and SMS where enabled on the first stage) tenants 3 days before rent is due."""
    from apps.rentals.models import RentalInvoice

    today = today or timezone.localdate()
    count = 0
    for inv in RentalInvoice.objects.filter(
            due_date=today + timezone.timedelta(days=3), balance_due__gt=0,
            status__in=[RentalInvoice.InvoiceStatus.SENT, RentalInvoice.InvoiceStatus.PARTIAL]) \
            .select_related('lease__tenant', 'lease__property', 'currency'):
        lease = inv.lease
        if not lease.tenant_id:
            continue
        currency = inv.currency.code if inv.currency_id else settings.COMPANY_CONFIG.get('currency', '')
        notify_contact(lease.tenant, f'Rent due {inv.due_date:%d %B}: {inv.invoice_number}',
                       f'Dear {lease.tenant.first_name},\n\nThis is a reminder that {currency} {inv.balance_due:,.2f} '
                       f'for {lease.property.name} (invoice {inv.invoice_number}) is due on {inv.due_date:%d %B %Y}.'
                       f'\n\nThank you,\n{settings.COMPANY_CONFIG.get("name", "")}',
                       channels=('email',), category='rent_reminder', related=f'invoice:{inv.invoice_number}')
        count += 1
    return f'{count} reminder(s)'
