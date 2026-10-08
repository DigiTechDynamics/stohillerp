"""
Property-management reports. Each returns {"title", "columns": [[key, label]], "rows": [...], "totals": {...}}
so the API can return JSON or CSV and saved reports can be e-mailed.

  rent_roll          tenancy schedule: every active lease with rent, charges, escalation, deposit, balance
  lease_expiry       leases ending in the next N months, by month, with option deadlines
  vacancy            vacant units (and unit-less properties) with days vacant and market rent
  arrears            overdue rent by property and managing agent, aged
  property_income    revenue, expenses and net income per property from the ledger, with yield
"""

from collections import defaultdict
from datetime import date
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.db.models import Q, Sum
from django.utils import timezone

ZERO = Decimal('0.00')
CENT = Decimal('0.01')


def _d(v):
    return str(v.quantize(CENT)) if isinstance(v, Decimal) else v


def _as_date(value):
    if not value:
        return None
    return value if isinstance(value, date) else date.fromisoformat(str(value))


def _props(params):
    from apps.properties.models import Property

    qs = Property.objects.all()
    if params.get('property'):
        qs = qs.filter(pk=params['property'])
    if params.get('portfolio'):
        qs = qs.filter(portfolio_id=params['portfolio'])
    if params.get('owner'):
        qs = qs.filter(Q(owner_id=params['owner']) | Q(ownerships__owner_id=params['owner'])).distinct()
    return qs


def rent_roll(params):
    from apps.rentals.models import Lease, RentalInvoice

    leases = Lease.objects.filter(status=Lease.LeaseStatus.ACTIVE, property__in=_props(params)) \
        .select_related('property', 'unit', 'tenant', 'currency').prefetch_related('charges', 'escalation_steps')
    rows, totals = [], defaultdict(lambda: ZERO)
    today = timezone.localdate()
    for lease in leases.order_by('property__reference_number', 'unit__unit_number'):
        charges = sum((c.monthly_amount for c in lease.charges.all() if c.applies_to(today)), ZERO)
        balance = RentalInvoice.objects.filter(lease=lease, balance_due__gt=0).exclude(
            status__in=['draft', 'cancelled']).aggregate(t=Sum('balance_due'))['t'] or ZERO
        area = lease.unit.floor_size if lease.unit_id and lease.unit.floor_size else None
        if lease.escalation_type == 'stepped':
            step = lease.escalation_steps.filter(applied_on__isnull=True).order_by('effective_date').first()
            next_esc = step.effective_date if step else None
            escalation = 'Stepped'
        elif lease.escalation_type in ('fixed', 'cpi'):
            years = relativedelta(today, lease.start_date).years + 1
            next_esc = lease.start_date + relativedelta(years=years)
            escalation = f'{lease.rental_escalation_rate}%' if lease.escalation_type == 'fixed' \
                else f'CPI + {lease.cpi_margin}%'
        else:
            next_esc, escalation = None, 'None'
        rows.append({
            'property': lease.property.name, 'unit': lease.unit.unit_number if lease.unit_id else '',
            'tenant': lease.tenant.full_name if lease.tenant_id else '', 'lease': lease.lease_number,
            'start': lease.start_date, 'end': lease.end_date, 'area_m2': _d(area) if area else '',
            'rent': _d(lease.monthly_rental), 'rent_per_m2': _d((lease.monthly_rental / area)) if area else '',
            'charges': _d(charges), 'escalation': escalation, 'next_escalation': next_esc,
            'deposit': _d(lease.deposit_amount if lease.deposit_paid else ZERO), 'balance': _d(balance),
            'currency': lease.currency.code if lease.currency_id else '',
        })
        for key, value in (('rent', lease.monthly_rental), ('charges', charges), ('balance', balance),
                           ('deposit', lease.deposit_amount if lease.deposit_paid else ZERO),
                           ('area_m2', area or ZERO)):
            totals[key] += value
    return {'title': 'Rent roll / tenancy schedule', 'rows': rows, 'totals': {k: _d(v) for k, v in totals.items()},
            'columns': [['property', 'Property'], ['unit', 'Unit'], ['tenant', 'Tenant'], ['lease', 'Lease'],
                        ['start', 'Start'], ['end', 'End'], ['area_m2', 'Area m²'], ['rent', 'Rent'],
                        ['rent_per_m2', 'Rent/m²'], ['charges', 'Charges'], ['escalation', 'Escalation'],
                        ['next_escalation', 'Next escalation'], ['deposit', 'Deposit held'],
                        ['balance', 'Balance owing']]}


def lease_expiry(params):
    from apps.propman.models import LeaseOption
    from apps.rentals.models import Lease

    months = int(params.get('months') or 12)
    today = timezone.localdate()
    until = today + relativedelta(months=months)
    leases = Lease.objects.filter(status=Lease.LeaseStatus.ACTIVE, end_date__range=(today, until),
                                  property__in=_props(params)).select_related('property', 'unit', 'tenant')
    rows, by_month = [], defaultdict(lambda: [0, ZERO])
    for lease in leases.order_by('end_date'):
        option = LeaseOption.objects.filter(lease=lease, status='open').order_by('notice_deadline').first()
        rows.append({'end': lease.end_date, 'property': lease.property.name,
                     'unit': lease.unit.unit_number if lease.unit_id else '',
                     'tenant': lease.tenant.full_name if lease.tenant_id else '', 'lease': lease.lease_number,
                     'rent': _d(lease.monthly_rental), 'days_left': (lease.end_date - today).days,
                     'option': f'{option.get_option_type_display()} by {option.notice_deadline}' if option else ''})
        bucket = by_month[lease.end_date.strftime('%Y-%m')]
        bucket[0] += 1
        bucket[1] += lease.monthly_rental
    return {'title': f'Lease expiries (next {months} months)', 'rows': rows,
            'totals': {'leases': len(rows), 'monthly_rent_at_risk': _d(sum((r[1] for r in by_month.values()), ZERO)),
                       'by_month': {m: {'leases': c, 'rent': _d(r)} for m, (c, r) in sorted(by_month.items())}},
            'columns': [['end', 'Ends'], ['days_left', 'Days left'], ['property', 'Property'], ['unit', 'Unit'],
                        ['tenant', 'Tenant'], ['lease', 'Lease'], ['rent', 'Monthly rent'], ['option', 'Open option']]}


def vacancy(params):
    from apps.properties.models import Property, PropertyUnit
    from apps.rentals.models import Lease

    today = timezone.localdate()
    props = _props(params)
    rows, lost = [], ZERO
    for unit in PropertyUnit.objects.filter(property__in=props).exclude(status=PropertyUnit.UnitStatus.OCCUPIED) \
            .select_related('property'):
        if Lease.objects.filter(unit=unit, status=Lease.LeaseStatus.ACTIVE).exists():
            continue
        last = Lease.objects.filter(unit=unit).exclude(end_date__isnull=True).order_by('-end_date').first()
        since = last.end_date if last else unit.created_at.date()
        rows.append({'property': unit.property.name, 'unit': unit.unit_number, 'type': unit.get_unit_type_display(),
                     'area_m2': _d(unit.floor_size) if unit.floor_size else '', 'status': unit.get_status_display(),
                     'vacant_since': since, 'days_vacant': (today - since).days,
                     'market_rent': _d(unit.monthly_rental) if unit.monthly_rental else ''})
        lost += unit.monthly_rental or ZERO
    for prop in props.filter(units__isnull=True, status__in=[Property.PropertyStatus.AVAILABLE,
                                                              Property.PropertyStatus.LISTED_FOR_RENT]):
        last = Lease.objects.filter(property=prop).exclude(end_date__isnull=True).order_by('-end_date').first()
        since = last.end_date if last else prop.created_at.date()
        rows.append({'property': prop.name, 'unit': '(whole property)', 'type': prop.property_type.name,
                     'area_m2': _d(prop.floor_size) if prop.floor_size else '', 'status': prop.get_status_display(),
                     'vacant_since': since, 'days_vacant': (today - since).days,
                     'market_rent': _d(prop.rental_rate) if prop.rental_rate else ''})
        lost += prop.rental_rate or ZERO
    rows.sort(key=lambda r: -r['days_vacant'])
    return {'title': 'Vacancy schedule', 'rows': rows,
            'totals': {'vacant': len(rows), 'monthly_market_rent_lost': _d(lost)},
            'columns': [['property', 'Property'], ['unit', 'Unit'], ['type', 'Type'], ['area_m2', 'Area m²'],
                        ['status', 'Status'], ['vacant_since', 'Vacant since'], ['days_vacant', 'Days vacant'],
                        ['market_rent', 'Market rent']]}


BUCKETS = [('current', None, 0), ('d1_30', 1, 30), ('d31_60', 31, 60), ('d61_90', 61, 90), ('over_90', 91, None)]


def age_bucket(days_overdue):
    for key, low, high in BUCKETS:
        if (low is None or days_overdue >= low) and (high is None or days_overdue <= high):
            return key
    return 'over_90'


def arrears(params):
    from apps.rentals.models import RentalInvoice

    today = timezone.localdate()
    invoices = RentalInvoice.objects.filter(balance_due__gt=0, lease__property__in=_props(params)) \
        .exclude(status__in=['draft', 'cancelled']).select_related('lease__property', 'lease__managing_agent')
    groups = {}
    for inv in invoices:
        prop = inv.lease.property
        agent = inv.lease.managing_agent.full_name if inv.lease.managing_agent_id else 'Unassigned'
        row = groups.setdefault((prop.pk, agent), {'property': prop.name, 'agent': agent, 'total': ZERO,
                                                   **{b: ZERO for b, _l, _h in BUCKETS}})
        bucket = age_bucket((today - inv.due_date).days)
        row[bucket] += inv.balance_due
        row['total'] += inv.balance_due
    rows = sorted(groups.values(), key=lambda r: -r['total'])
    totals = {k: sum((r[k] for r in rows), ZERO) for k in ['total'] + [b for b, _l, _h in BUCKETS]}
    return {'title': 'Arrears by property and agent', 'rows': [{k: _d(v) for k, v in r.items()} for r in rows],
            'totals': {k: _d(v) for k, v in totals.items()},
            'columns': [['property', 'Property'], ['agent', 'Managing agent'], ['current', 'Not yet due'],
                        ['d1_30', '1-30 days'], ['d31_60', '31-60'], ['d61_90', '61-90'], ['over_90', '90+'],
                        ['total', 'Total']]}


def property_income(params):
    from apps.finance.models import JournalEntry, JournalLine
    from apps.rentals.owners import owner_funds_code

    owner_funds = owner_funds_code()

    today = timezone.localdate()
    date_to = _as_date(params.get('to_date')) or today
    date_from = _as_date(params.get('from_date')) or date_to.replace(month=1, day=1)
    months = max((date_to - date_from).days / Decimal('30.4375'), Decimal('1'))
    rows, totals = [], defaultdict(lambda: ZERO)
    for prop in _props(params).order_by('reference_number'):
        lines = JournalLine.objects.filter(property_ref=prop, entry__status__in=JournalEntry.LEDGER_STATUSES,
                                           entry__entry_date__range=(date_from, date_to))

        def net(account_type, normal, **extra):
            agg = lines.filter(account__account_type=account_type, **extra).aggregate(
                dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
            dr, cr = agg['dr'] or ZERO, agg['cr'] or ZERO
            return cr - dr if normal == 'credit' else dr - cr

        revenue = net('revenue', 'credit')
        expenses = net('expense', 'debit')
        # Managed properties: rent belongs to the owner (owner funds); show it for context.
        owner_rent = net('liability', 'credit', account__code=owner_funds) if prop.is_managed else ZERO
        noi = revenue - expenses
        annual = noi * 12 / months
        valuation = prop.current_valuation or ZERO
        rows.append({'property': prop.name, 'reference': prop.reference_number,
                     'ownership': prop.get_ownership_type_display(), 'revenue': _d(revenue),
                     'expenses': _d(expenses), 'net_income': _d(noi), 'owner_funds': _d(owner_rent),
                     'valuation': _d(valuation) if valuation else '',
                     'yield_percent': _d(annual / valuation * 100) if valuation else ''})
        for key, value in (('revenue', revenue), ('expenses', expenses), ('net_income', noi),
                           ('owner_funds', owner_rent)):
            totals[key] += value
    return {'title': f'Income and expenses per property {date_from} to {date_to}', 'rows': rows,
            'totals': {k: _d(v) for k, v in totals.items()},
            'columns': [['reference', 'Ref'], ['property', 'Property'], ['ownership', 'Ownership'],
                        ['revenue', 'Revenue'], ['expenses', 'Expenses'], ['net_income', 'Net income'],
                        ['owner_funds', 'Collected for owner'], ['valuation', 'Valuation'],
                        ['yield_percent', 'Yield % (annualised)']]}


REPORTS = {'rent_roll': rent_roll, 'lease_expiry': lease_expiry, 'vacancy': vacancy, 'arrears': arrears,
           'property_income': property_income}


def run_report(key, params):
    if key not in REPORTS:
        raise KeyError(key)
    return REPORTS[key](params or {})


def to_csv(report) -> str:
    import csv
    import io

    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow([label for _k, label in report['columns']])
    for row in report['rows']:
        writer.writerow([row.get(k, '') for k, _label in report['columns']])
    return out.getvalue()


def send_scheduled_reports(today=None) -> str:
    """Weekly reports go out on Mondays, monthly ones on the 1st."""
    from apps.notifications.services import send_email
    from apps.propman.models import SavedReport

    today = today or timezone.localdate()
    due = []
    if today.weekday() == 0:
        due.append(SavedReport.Schedule.WEEKLY)
    if today.day == 1:
        due.append(SavedReport.Schedule.MONTHLY)
    sent = 0
    for saved in SavedReport.objects.filter(schedule__in=due).exclude(last_sent_on=today):
        report = run_report(saved.report, saved.params)
        attachment = (f'{saved.report}_{today}.csv', to_csv(report).encode(), 'text/csv')
        for email in [e.strip() for e in saved.recipients.split(',') if e.strip()] or [saved.owner.email]:
            send_email(email, f'{saved.name} ({today})', f'{report["title"]}: {len(report["rows"])} row(s) attached.',
                       category='scheduled_report', related=f'report:{saved.pk}', attachments=[attachment])
        saved.last_sent_on = today
        saved.save(update_fields=['last_sent_on'])
        sent += 1
    return f'{sent} scheduled report(s) sent'
