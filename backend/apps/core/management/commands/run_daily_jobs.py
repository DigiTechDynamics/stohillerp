"""
manage.py run_daily_jobs

The scheduled work, in dependency order. Each job is idempotent, so a missed
or repeated day is harmless. Run once a day (the `scheduler` service in
docker-compose.yml does this; cron or Celery beat work equally well):

1. Bill leases due up to today (generate_rental_invoices).
2. Rent reminders and late fees (process_rental_overdue).
3. Depreciate fixed assets up to the end of last month.
4. Reverse auto-reversing accruals and generate due recurring journals.

A failure in one job is reported and the rest still run; the command exits
non-zero so the scheduler's logs/alerts show it.
"""

import logging

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

logger = logging.getLogger('stohill.jobs')


def _depreciate_to_last_month_end():
    from apps.fixed_assets.services.depreciation import DepreciationService
    month_end = timezone.localdate().replace(day=1) - timezone.timedelta(days=1)
    return f'{len(DepreciationService().run_depreciation_for_period(end_date=month_end))} book(s) depreciated'


def _recurring_journals():
    from apps.finance.services.recurring import run_recurring_journals
    return run_recurring_journals(timezone.localdate())


def _arrears():
    from apps.propman.services.arrears import run_arrears
    return run_arrears()


def _lease_alerts():
    from apps.propman.services.lease_terms import run_lease_alerts
    return run_lease_alerts()


def _planned_maintenance():
    from apps.propman.services.maintenance import raise_planned_jobs
    return raise_planned_jobs()


def _deposit_interest():
    # Credits last month's interest; idempotent per lease and month.
    from apps.propman.services.collections import credit_deposit_interest
    return credit_deposit_interest()


def _scheduled_reports():
    from apps.propman.services.reports import send_scheduled_reports
    return send_scheduled_reports()


JOBS = [
    ('Rental billing', lambda: call_command('generate_rental_invoices')),
    ('Rental overdue processing', lambda: call_command('process_rental_overdue')),
    ('Arrears collections', _arrears),
    ('Lease expiry, option and guarantee alerts', _lease_alerts),
    ('Planned maintenance', _planned_maintenance),
    ('Deposit interest', _deposit_interest),
    ('Depreciation', _depreciate_to_last_month_end),
    ('Recurring and reversing journals', _recurring_journals),
    ('Scheduled reports', _scheduled_reports),
]


class Command(BaseCommand):
    help = 'Run the daily scheduled jobs (billing, overdue, depreciation, recurring journals).'

    def handle(self, *args, **options):
        failures = []
        for name, job in JOBS:
            try:
                outcome = job()
                self.stdout.write(self.style.SUCCESS(f'{name}: ok' + (f' ({outcome})' if outcome else '')))
            except Exception as e:  # keep going; report at the end
                logger.exception('Scheduled job failed: %s', name)
                failures.append(name)
                self.stderr.write(self.style.ERROR(f'{name}: FAILED - {e}'))
        if failures:
            raise CommandError(f'{len(failures)} job(s) failed: {", ".join(failures)}')
