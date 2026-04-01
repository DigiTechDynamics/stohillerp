from datetime import date
from django.core.management.base import BaseCommand
from apps.rentals.services.billing import LeaseBillingService

class Command(BaseCommand):
    help = 'Processes annual rental escalations for all active leases due for a rent increase.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--date',
            type=str,
            help='Process as of a specific date (YYYY-MM-DD). Defaults to today.',
        )

    def handle(self, *args, **options):
        self.stdout.write('Starting Stohill Rental Escalation Process...')
        
        target_date = None
        if options['date']:
            try:
                target_date = date.fromisoformat(options['date'])
                self.stdout.write(f"Running for target date: {target_date}")
            except ValueError:
                self.stderr.write(self.style.ERROR(f'Invalid date format: {options["date"]}. Use YYYY-MM-DD.'))
                return

        results = LeaseBillingService.process_escalations(target_date=target_date)
        
        self.stdout.write(f"Escalation Process Complete:")
        self.stdout.write(f"  - Escalations Applied: {results['escalations_applied']}")
        self.stdout.write(f"  - Leases Skipped:      {results['skipped']}")
        
        if len(results['errors']) > 0:
            self.stdout.write(self.style.ERROR('\nError details:'))
            for err in results['errors']:
                self.stdout.write(self.style.ERROR(f"    * {err}"))
            
        if results['escalations_applied'] > 0:
            self.stdout.write(self.style.SUCCESS(f"\nCompleted: {results['escalations_applied']} rent increases applied and logged."))
        else:
            self.stdout.write("No leases were due for escalation on the target date.")
