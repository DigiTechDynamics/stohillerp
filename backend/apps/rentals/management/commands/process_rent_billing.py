from datetime import date
from django.core.management.base import BaseCommand
from apps.rentals.services.billing import LeaseBillingService

class Command(BaseCommand):
    help = 'Processes monthly rental invoicing for all active leases due for billing.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--date',
            type=str,
            help='Process as of a specific date (YYYY-MM-DD). Defaults to today.',
        )

    def handle(self, *args, **options):
        self.stdout.write('Starting Stohill Rental Invoicing Process...')
        
        target_date = None
        if options['date']:
            try:
                target_date = date.fromisoformat(options['date'])
                self.stdout.write(f"Running for target date: {target_date}")
            except ValueError:
                self.stderr.write(self.style.ERROR(f'Invalid date format: {options["date"]}. Use YYYY-MM-DD.'))
                return

        results = LeaseBillingService.generate_monthly_invoices(target_date=target_date)
        
        self.stdout.write(f"Invoicing Process Complete:")
        self.stdout.write(f"  - Successfully Processed: {results['processed']}")
        self.stdout.write(f"  - Failed Operations:      {results['failed']}")
        
        if results['failed'] > 0:
            self.stdout.write(self.style.ERROR('\nError details:'))
            for err in results['errors']:
                self.stdout.write(self.style.ERROR(f"    * {err}"))
            
        if results['processed'] > 0:
            self.stdout.write(self.style.SUCCESS(f"\nCompleted: {results['processed']} invoices generated and synced to finance."))
        else:
            self.stdout.write("No leases were due for invoicing on the target date.")
