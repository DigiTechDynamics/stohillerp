from datetime import date
from django.core.management.base import BaseCommand
from apps.rentals.services.escalation import LeaseEscalationService

class Command(BaseCommand):
    help = 'Scans for leases approaching their anniversary and generates rent increase notices (60 days in advance).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--date',
            type=str,
            help='Process as of a specific date (YYYY-MM-DD). Defaults to today.',
        )
        parser.add_argument(
            '--days',
            type=int,
            default=60,
            help='Days in advance to look for escalations. Default is 60.',
        )

    def handle(self, *args, **options):
        self.stdout.write('Starting Stohill Proactive Lease Escalation Notification...')
        
        target_date = None
        if options['date']:
            try:
                target_date = date.fromisoformat(options['date'])
                self.stdout.write(f"Running for target date: {target_date}")
            except ValueError:
                self.stderr.write(self.style.ERROR(f'Invalid date format: {options["date"]}. Use YYYY-MM-DD.'))
                return

        days_advance = options['days']
        results = LeaseEscalationService.process_escalation_notices(
            days_advance=days_advance, 
            target_date=target_date
        )
        
        self.stdout.write(f"Escalation Notification Process Complete:")
        self.stdout.write(f"  - Notices Prepared: {results['notices_sent']}")
        self.stdout.write(f"  - Failed:           {results['failed']}")
        
        if len(results['errors']) > 0:
            self.stdout.write(self.style.ERROR('\nError details:'))
            for err in results['errors']:
                self.stdout.write(self.style.ERROR(f"    * {err}"))
            
        if results['notices_sent'] > 0:
            self.stdout.write(self.style.SUCCESS(f"\nCompleted: {results['notices_sent']} escalation notices prepared and logged."))
        else:
            self.stdout.write("No leases found approaching their anniversary for the given criteria.")
