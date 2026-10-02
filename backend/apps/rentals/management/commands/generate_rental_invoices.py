"""
manage.py generate_rental_invoices [--as-of YYYY-MM-DD]

Bills every active lease up to the given date (default: today) and posts the
invoices to AR. Idempotent; schedule daily before process_rental_overdue.
"""

from datetime import date

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.rentals.services.billing import generate_due_invoices


class Command(BaseCommand):
    help = 'Generate and post due rental invoices (with annual escalation).'

    def add_arguments(self, parser):
        parser.add_argument('--as-of', help='Bill up to this date (YYYY-MM-DD). Default: today.')

    def handle(self, *args, **options):
        try:
            as_of = date.fromisoformat(options['as_of']) if options['as_of'] else timezone.localdate()
        except ValueError:
            raise CommandError('--as-of must be YYYY-MM-DD')

        result = generate_due_invoices(as_of)
        self.stdout.write(self.style.SUCCESS(
            f'{len(result.created)} invoice(s) created, {len(result.escalated)} escalation(s) applied.'))
        if result.invoices and getattr(settings, 'EMAIL_INVOICES_ON_BILLING', False):
            from apps.propman.services.distribution import email_rental_invoices
            outcome = email_rental_invoices(result.invoices)
            self.stdout.write(f"{outcome['sent']} invoice(s) emailed, {outcome['skipped']} without an email address.")
        for lease_number, message in result.errors:
            self.stderr.write(self.style.ERROR(f'{lease_number}: {message}'))
        if result.errors:
            raise CommandError(f'{len(result.errors)} lease(s) failed; see above.')
