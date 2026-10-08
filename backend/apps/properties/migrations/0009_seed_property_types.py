"""Give existing installs the starter property types; without one no property can be created."""

from django.db import migrations

from apps.properties.seeds import PROPERTY_TYPES


def seed(apps, schema_editor):
    PropertyType = apps.get_model('properties', 'PropertyType')
    for code, name, description in PROPERTY_TYPES:
        PropertyType.objects.get_or_create(code=code, defaults={'name': name, 'description': description})


class Migration(migrations.Migration):

    dependencies = [
        ('properties', '0008_configurable_defaults'),
    ]

    operations = [
        migrations.RunPython(seed, migrations.RunPython.noop),
    ]
