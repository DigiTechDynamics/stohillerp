from django.apps import AppConfig


class NotificationsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.notifications'
    verbose_name = 'Notifications (email and SMS)'

    def ready(self):
        from apps.notifications import integrations  # noqa: F401  registers the startup checks
