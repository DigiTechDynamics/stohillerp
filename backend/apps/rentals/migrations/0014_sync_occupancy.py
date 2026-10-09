"""Bring unit and property statuses in line with existing leases (occupied / reserved / under contract)."""

from django.db import migrations


def sync(apps, schema_editor):
    from apps.rentals.models import Lease, sync_occupancy

    pairs = Lease.objects.values_list('unit_id', 'property_id')
    sync_occupancy([u for u, _ in pairs], [p for _, p in pairs])


class Migration(migrations.Migration):
    dependencies = [
        ('rentals', '0013_configurable_defaults'),
        ('properties', '0009_seed_property_types'),
    ]

    operations = [migrations.RunPython(sync, migrations.RunPython.noop)]
