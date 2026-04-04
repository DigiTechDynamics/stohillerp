"""
Stohill Properties – Integrations Signals
==========================================
Listens to Property post_save and SaleTransaction post_save
to push updates to Supabase asynchronously using a thread.
"""

import logging
import threading

from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger('stohill.integrations')


def _push_async(fn, *args, **kwargs):
    """Fire-and-forget: run fn in a daemon thread so requests never block."""
    t = threading.Thread(target=fn, args=args, kwargs=kwargs, daemon=True)
    t.start()


@receiver(post_save, sender='properties.Property')
def on_property_saved(sender, instance, **kwargs):
    """Push full property payload to Supabase whenever a Property is saved."""
    from apps.integrations.services.supabase_sync import supabase_sync
    _push_async(supabase_sync.push_property, instance)


@receiver(post_save, sender='sales.SaleTransaction')
def on_sale_status_changed(sender, instance, **kwargs):
    """
    When a SaleTransaction reaches REGISTERED ('registered'), 
    update the property status to 'sold' on Supabase.
    """
    from apps.integrations.services.supabase_sync import supabase_sync
    from apps.sales.models import SaleTransaction

    if instance.status == SaleTransaction.TransactionStatus.REGISTERED:
        _push_async(
            supabase_sync.push_status_update,
            instance.property_id,
            'sold',
        )
