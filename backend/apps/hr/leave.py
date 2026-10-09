"""
Leave days are working days (Monday to Friday). A request is given as a start
date and the days applied for; the end date follows from them, so the two can't
disagree. Half days round up to the day they finish on (2.5 days from Monday
ends on Wednesday).
"""

import math
from datetime import timedelta
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
