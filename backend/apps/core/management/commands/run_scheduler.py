"""
manage.py run_scheduler [--at HH:MM]

Long-running loop for the `scheduler` container: runs `run_daily_jobs` once a
day at the given business-timezone time (default 02:00). Kept dependency-free;
swap for cron or Celery beat if you already run one.
"""

import time
from datetime import datetime, timedelta

from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone


def seconds_until(hour, minute, now=None):
    now = now or timezone.localtime()
    target = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


class Command(BaseCommand):
    help = 'Run run_daily_jobs every day at a fixed time.'

    def add_arguments(self, parser):
        parser.add_argument('--at', default='02:00', help='Local time HH:MM (default 02:00).')

    def handle(self, *args, **options):
        try:
            at = datetime.strptime(options['at'], '%H:%M')
        except ValueError:
            raise CommandError('--at must be HH:MM')
        self.stdout.write(f'Scheduler started; daily jobs run at {options["at"]} local time.')
        while True:
            wait = seconds_until(at.hour, at.minute)
            self.stdout.write(f'Next run in {wait / 3600:.1f} h.')
            time.sleep(wait)
            try:
                call_command('run_daily_jobs', stdout=self.stdout, stderr=self.stderr)
            except CommandError as e:
                # Already logged per job; keep the scheduler alive for tomorrow.
                self.stderr.write(str(e))
