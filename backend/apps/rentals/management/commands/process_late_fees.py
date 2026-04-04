from datetime import date
from django.core.management.base import BaseCommand
from apps.rentals.services.billing import LeaseBillingService

class Command(BaseCommand):
    help = 'Processes automated late fees for all overdue rental invoices past the grace period.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--date',
            type=str,
            help='Process as of a specific date (YYYY-MM-DD). Defaults to today.',
        )

    def handle(self, *args, **options):
        self.stdout.write('Starting Stohill Late Fee Processing...')
        
        target_date = None
        if options['date']:
            try:
                target_date = date.fromisoformat(options['date'])
                self.stdout.write(f"Running for target date: {target_date}")
            except ValueError:
                self.stderr.write(self.style.ERROR(f'Invalid date format: {options["date"]}. Use YYYY-MM-DD.'))
                return

        results = LeaseBillingService.apply_late_fees(target_date=target_date)
        
        self.stdout.write(f"Late Fee Process Complete:")
        self.stdout.write(f"  - Penalties Applied: {results['applied']}")
        self.stdout.write(f"  - Total Revenue Gen: {results['total_penalties']}")
        
        if results['errors']:
            self.stdout.write(self.style.ERROR('\nError details:'))
            for err in results['errors']:
                self.stdout.write(self.style.ERROR(f"    * {err}"))
            
        if results['applied'] > 0:
            self.stdout.write(self.style.SUCCESS(f"\nCompleted: {results['applied']} late fees applied and synced to finance."))
        else:
            self.stdout.write("No overdue invoices were found eligible for late fees.")
