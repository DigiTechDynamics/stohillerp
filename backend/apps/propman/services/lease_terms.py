"""
Lease terms depth: escalation by type, turnover rent, and alerts for lease
expiry, option deadlines and expiring guarantees.
"""

import logging
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.utils import timezone

from apps.propman.models import CPIIndex, LeaseGuarantee, LeaseOption, TurnoverReport

logger = logging.getLogger('stohill.propman.lease_terms')
CENT = Decimal('0.01')


def _cpi_on(month):
    """The CPI for a month (or the latest published before it)."""
    return CPIIndex.objects.filter(month__lte=month.replace(day=1)).order_by('-month').first()


def apply_lease_escalation(lease, period_start) -> bool:
    """Escalate the rent for the period according to the lease's escalation type."""
    from apps.rentals.models import Lease
    from apps.rentals.services.billing import apply_escalation

    kind = lease.escalation_type
    if kind == Lease.EscalationType.NONE:
        return False
    if kind == Lease.EscalationType.FIXED:
        return apply_escalation(lease, period_start)
    if kind == Lease.EscalationType.STEPPED:
        changed = False
        for step in lease.escalation_steps.filter(effective_date__lte=period_start, applied_on__isnull=True) \
                .order_by('effective_date'):
            if step.new_rent is not None:
                lease.monthly_rental = step.new_rent
            elif step.percent is not None:
                lease.monthly_rental = (lease.monthly_rental * (1 + step.percent / 100)).quantize(CENT)
            step.applied_on = period_start
            step.save(update_fields=['applied_on'])
            lease.last_escalation_date = step.effective_date
            changed = True
        return changed
    if kind == Lease.EscalationType.CPI:
        years = relativedelta(period_start, lease.start_date).years
        if years < 1:
            return False
        anniversary = lease.start_date + relativedelta(years=years)
        if lease.last_escalation_date and lease.last_escalation_date >= anniversary:
            return False
        # CPI growth over the year to the month before each anniversary.
        now = _cpi_on(anniversary - relativedelta(months=1))
        then = _cpi_on(anniversary - relativedelta(years=1, months=1))
        if not now or not then or now.pk == then.pk:
            logger.warning('CPI escalation for %s skipped: CPI for %s not entered yet.', lease.lease_number,
                           anniversary - relativedelta(months=1))
            return False
        growth = now.value / then.value - 1
        lease.monthly_rental = (lease.monthly_rental * (1 + growth + lease.cpi_margin / 100)).quantize(CENT)
        lease.last_escalation_date = anniversary
        return True
    return False


def turnover_charge_lines(lease, period_start):
    """(lines, reports): % rent on turnover above the base rent, for months reported before this period."""
    if not lease.turnover_rent_percent:
        return [], []
    lines, reports = [], []
    for report in lease.turnover_reports.filter(billed_invoice__isnull=True, month__lt=period_start):
        due = (report.turnover * lease.turnover_rent_percent / 100 - lease.monthly_rental).quantize(CENT)
        report.percentage_rent = max(due, Decimal('0.00'))
        reports.append(report)
        if report.percentage_rent > 0:
            lines.append({'description': f'Turnover rent {report.month:%B %Y} ({lease.turnover_rent_percent}% of '
                                         f'{report.turnover} above base rent)',
                          'account_code': '4100', 'amount': str(report.percentage_rent), 'vat': '0.00',
                          'source': f'turnover:{report.pk}'})
    return lines, reports


def mark_turnover_billed(reports, invoice):
    for report in reports:
        report.billed_invoice = invoice
        report.save(update_fields=['billed_invoice', 'percentage_rent'])


def _alert(lease, subject, body, today):
    """Email the managing agent (or the company inbox) and log a CRM activity on the tenant."""
    from apps.crm.models import Activity
    from apps.notifications.services import send_email

    to = (lease.managing_agent.email if lease.managing_agent_id else '') or settings.COMPANY_CONFIG.get('email', '')
    send_email(to, subject, body, contact=lease.tenant, category='lease_alert', related=f'lease:{lease.lease_number}')
    if lease.tenant_id:
        Activity.objects.create(contact=lease.tenant, activity_type=Activity.ActivityType.NOTE, subject=subject,
                                description=body, status=Activity.ActivityStatus.PLANNED, due_date=timezone.now())


def run_lease_alerts(today=None) -> str:
    """Lease expiries at each alert horizon, option deadlines, guarantees expiring within 30 days."""
    from apps.rentals.models import Lease

    today = today or timezone.localdate()
    sent = 0
    for days in getattr(settings, 'LEASE_EXPIRY_ALERT_DAYS', [90, 60, 30]):
        for lease in Lease.objects.filter(status=Lease.LeaseStatus.ACTIVE,
                                          end_date=today + relativedelta(days=days)).select_related('tenant', 'property'):
            _alert(lease, f'Lease {lease.lease_number} ends in {days} days',
                   f'Lease {lease.lease_number} ({lease.property.name}, {lease.tenant}) ends on {lease.end_date}. '
                   f'Arrange renewal or re-letting.', today)
            sent += 1
    for option in LeaseOption.objects.filter(status=LeaseOption.Status.OPEN, alerted_on__isnull=True) \
            .select_related('lease__tenant', 'lease__property'):
        if option.notice_deadline - relativedelta(days=option.alert_days) <= today <= option.notice_deadline:
            _alert(option.lease, f'{option.get_option_type_display()} deadline {option.notice_deadline}',
                   f'Lease {option.lease.lease_number}: notice for the {option.get_option_type_display().lower()} '
                   f'must be given by {option.notice_deadline}. {option.terms}', today)
            option.alerted_on = today
            option.save(update_fields=['alerted_on'])
            sent += 1
    for option in LeaseOption.objects.filter(status=LeaseOption.Status.OPEN, notice_deadline__lt=today):
        option.status = LeaseOption.Status.LAPSED
        option.save(update_fields=['status'])
    for guarantee in LeaseGuarantee.objects.filter(status=LeaseGuarantee.Status.HELD,
                                                   expiry_date=today + relativedelta(days=30)).select_related('lease'):
        _alert(guarantee.lease, f'Guarantee {guarantee.reference or guarantee.provider} expires in 30 days',
               f'The {guarantee.get_guarantee_type_display().lower()} from {guarantee.provider} '
               f'({guarantee.amount}) on lease {guarantee.lease.lease_number} expires on {guarantee.expiry_date}.',
               today)
        sent += 1
    return f'{sent} alert(s)'


def record_turnover(lease, month, turnover, user=None) -> TurnoverReport:
    report, _ = TurnoverReport.objects.update_or_create(
        lease=lease, month=month.replace(day=1), defaults={'turnover': Decimal(str(turnover)), 'submitted_by': user})
    return report
