from django.core.management.base import BaseCommand
from apps.crm.tasks import check_activity_reminders

class Command(BaseCommand):
    help = 'Check for upcoming CRM activities and notify assigned users.'

    def handle(self, *args, **options):
        self.stdout.write('Checking CRM activity reminders...')
        count = check_activity_reminders()
        self.stdout.write(self.style.SUCCESS(f'Successfully sent {count} reminders.'))
