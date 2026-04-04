"""
Stohill Properties – Integrations App
Manages external integrations: Supabase/Lovable CMS, future webhooks.
"""
from django.apps import AppConfig


class IntegrationsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.integrations'
    verbose_name = 'Integrations'

    def ready(self):
        # Import signals so they register when the app loads
        import apps.integrations.signals  # noqa: F401
