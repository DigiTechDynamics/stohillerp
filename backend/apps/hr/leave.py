"""
Leave days are working days (Monday to Friday). A request is given as a start
date and the days applied for; the end date follows from them, so the two can't
disagree. Half days round up to the day they finish on (2.5 days from Monday
ends on Wednesday).
"""

import math
from datetime import date, timedelta
from decimal import Decimal


def is_working_day(day):
    return day.weekday() < 5


def working_days(start, end):
    """Working days from start to end, both included."""
    count, day = 0, start
    while day <= end:
        count += is_working_day(day)
        day += timedelta(days=1)
    return count


def end_date_for(start, days):
    """The working day on which `days` of leave starting on `start` ends."""
    remaining, day = math.ceil(Decimal(str(days))), start
    while True:
        if is_working_day(day):
            remaining -= 1
            if remaining <= 0:
                return day
        day += timedelta(days=1)


# ─── Balances (Labour Act [Chapter 28:01], Zimbabwe) ────────────────────────
#
# Balances are worked out from the employee's start date, their approved and
# pending requests, and any extra days added as leave allocations (an opening
# balance carried in, or days given above the legal minimum). Applying for leave
# holds the days at once; approving moves them to "taken"; rejecting or
# cancelling gives them back. The same rules cover company employees and agents.

ACCRUAL_DAYS = 17                 # s14A: one day's vacation leave for every 17 days worked
ANNUAL_CAP = Decimal('90')        # s14A: vacation leave stops building up at 90 days
SICK_DAYS = Decimal('90')         # s14: 90 days on full pay a year (a further 90 on half pay with a doctor's note)
SPECIAL_DAYS = Decimal('12')      # s14B: special leave, up to 12 days a calendar year
MATERNITY_DAYS = Decimal('98')    # s18: 98 days on full pay after a year's service,
MATERNITY_GAP_MONTHS = 24         # once every 24 months,
MATERNITY_TIMES = 3               # and no more than three times with the same employer

RULES = {
    'annual': 'Labour Act s14A: 1 day for every 17 days worked, building up to at most 90 days.',
    'sick': 'Labour Act s14: 90 days on full pay each year of service '
            '(a further 90 on half pay with a medical certificate).',
    'special': 'Labour Act s14B: up to 12 days special leave each calendar year.',
    'maternity': "Labour Act s18: 98 days on full pay after a year's service, once every 24 months, up to three times.",
    'unpaid': 'No limit: unpaid leave is not deducted from a balance.',
}
TWO_DP = Decimal('0.01')


def _anniversary(start, year):
    try:
        return start.replace(year=year)
    except ValueError:                                     # 29 February
        return start.replace(year=year, day=28)


def _months_back(day, months):
    month = day.month - 1 - months
    year, month = day.year + month // 12, month % 12 + 1
    try:
        return day.replace(year=year, month=month)
    except ValueError:
        return day.replace(year=year, month=month, day=28)


def leave_balances(employee, on=None, requests=None, allocations=None, exclude=None):
    """
    One row per leave type: entitled, taken (approved), pending and available days.

    `on` is the date the balance is worked out for (today by default; a request's
    start date when checking it). `requests` and `allocations` may be passed in
    already loaded (as .values() dicts) to save a query per employee; `exclude`
    leaves out the request being edited. `entitled` and `available` are None for
    leave with no limit.
    """
    from apps.hr.models import LeaveAllocation, LeaveRequest

    on = on or date.today()
    if requests is None:
        requests = list(LeaveRequest.objects.filter(employee=employee, status__in=['pending', 'approved'])
                        .values('id', 'leave_type', 'status', 'start_date', 'days_requested'))
    if allocations is None:
        allocations = list(LeaveAllocation.objects.filter(employee=employee)
                           .values('leave_type', 'days_allocated', 'valid_from', 'valid_to'))
    requests = [r for r in requests if r['status'] in ('pending', 'approved') and r.get('id') != exclude]
    extra = {}
    for a in allocations:
        if (a['valid_from'] is None or a['valid_from'] <= on) and (a['valid_to'] is None or a['valid_to'] >= on):
            extra[a['leave_type']] = extra.get(a['leave_type'], Decimal('0')) + Decimal(a['days_allocated'])

    start = employee.start_date
    last_day = min(on, employee.end_date) if employee.end_date else on
    service_days = (last_day - start).days + 1 if start and last_day >= start else 0

    def used(leave_type, since=None, until=None):
        taken = pending = Decimal('0')
        for r in requests:
            if r['leave_type'] != leave_type:
                continue
            if (since and r['start_date'] < since) or (until and r['start_date'] > until):
                continue
            if r['status'] == 'approved':
                taken += Decimal(r['days_requested'])
            else:
                pending += Decimal(r['days_requested'])
        return taken, pending

    rows = []
    for leave_type, label in LeaveRequest.LeaveType.choices:
        rule, period, entitled = RULES.get(leave_type, ''), '', None
        if leave_type == 'annual':
            taken, pending = used('annual')
            accrued = (Decimal(service_days) / ACCRUAL_DAYS).quantize(TWO_DP, rounding='ROUND_DOWN')
            due = min(accrued + extra.get('annual', 0) - taken, ANNUAL_CAP)    # what is owed, capped at 90
            entitled = due + taken
            period = f'Built up since {start:%d %b %Y}'
        elif leave_type == 'sick':
            year = on.year if _anniversary(start, on.year) <= on else on.year - 1
            since = _anniversary(start, year)
            until = _anniversary(start, year + 1) - timedelta(days=1)
            taken, pending = used('sick', since, until)
            entitled = (SICK_DAYS if service_days else Decimal('0')) + extra.get('sick', 0)
            period = f'Service year {since:%d %b %Y} – {until:%d %b %Y}'
        elif leave_type == 'special':
            taken, pending = used('special', date(on.year, 1, 1), date(on.year, 12, 31))
            entitled = (SPECIAL_DAYS if service_days else Decimal('0')) + extra.get('special', 0)
            period = f'Calendar year {on.year}'
        elif leave_type == 'maternity':
            since = _months_back(on, MATERNITY_GAP_MONTHS)
            taken, pending = used('maternity', since)
            times = sum(1 for r in requests if r['leave_type'] == 'maternity' and r['status'] == 'approved'
                        and r['start_date'] < since)
            if service_days < 365:
                entitled, period = Decimal('0'), "Due after a year's service"
            elif times >= MATERNITY_TIMES:
                entitled, period = Decimal('0'), 'Already taken three times with this employer'
            else:
                entitled, period = MATERNITY_DAYS, f'Since {since:%d %b %Y}'
            entitled += extra.get('maternity', 0)
        elif leave_type in extra:                          # family, study: only days given as allocations
            froms = [a['valid_from'] for a in allocations if a['leave_type'] == leave_type and a['valid_from']]
            taken, pending = used(leave_type, min(froms) if froms else None)
            entitled, rule, period = extra[leave_type], 'Days given as leave allocations.', 'Allocated'
        else:
            taken, pending = used(leave_type)
            if leave_type != 'unpaid':
                rule = 'Not set by the Labour Act; add a leave allocation to give a balance.'
            period = 'No limit'
        rows.append({'leave_type': leave_type, 'label': label, 'entitled': entitled, 'taken': taken,
                     'pending': pending, 'available': None if entitled is None else entitled - taken - pending,
                     'rule': rule, 'period': period})
    return rows


def balance_for(employee, leave_type, on=None, exclude=None):
    return next(row for row in leave_balances(employee, on, exclude=exclude) if row['leave_type'] == leave_type)
