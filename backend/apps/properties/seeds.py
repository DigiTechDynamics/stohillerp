"""Starter property types (idempotent; administrators can rename, add or remove them)."""

from django.db import transaction

# (code, name, description); the codes match the demo data and the import templates.
PROPERTY_TYPES = [
    ('RES', 'Residential', 'Houses, flats and cluster homes'),
    ('SEC', 'Sectional Title', 'Units in a sectional title scheme'),
    ('COM', 'Commercial', 'Offices, retail and shopping centres'),
    ('IND', 'Industrial', 'Warehouses, factories and yards'),
    ('AGR', 'Agricultural', 'Farms and smallholdings'),
    ('VAC', 'Vacant Land', 'Undeveloped stands and plots'),
    ('MIX', 'Mixed Use', 'Combined residential and commercial use'),
]


@transaction.atomic
def seed_property_types() -> None:
    from apps.properties.models import PropertyType

    for code, name, description in PROPERTY_TYPES:
        PropertyType.objects.get_or_create(code=code, defaults={'name': name, 'description': description})
