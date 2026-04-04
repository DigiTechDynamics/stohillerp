from django.core.management.base import BaseCommand
from apps.integrations.services.supabase_sync import supabase_sync

class Command(BaseCommand):
    help = 'Push all ERP properties to Supabase (Lovable Website)'

    def handle(self, *args, **options):
        self.stdout.write(self.style.NOTICE('Starting full Supabase synchronization...'))
        
        result = supabase_sync.bulk_push_all()
        
        if 'error' in result:
            self.stdout.write(self.style.ERROR(f"Error: {result['error']}"))
            return

        pushed = result.get('pushed', 0)
        failed = result.get('failed', 0)
        
        self.stdout.write(self.style.SUCCESS(
            f"Successfully synced {pushed} properties to Supabase."
        ))
        
        if failed > 0:
            self.stdout.write(self.style.WARNING(
                f"Failed to sync {failed} properties. Check logs for details."
            ))
