"""Starter document types (idempotent; administrators can rename, add or deactivate them)."""

from django.db import transaction

# (code, name, retention years, description)
DOCUMENT_TYPES = [
    ('TITLE', 'Property Title Deeds', 30, 'Title deeds and transfer documents'),
    ('LEASE', 'Lease Agreements', 7, 'Signed leases, addenda and renewals'),
    ('KYC', 'KYC Documents', 7, 'IDs, proof of residence and other client due diligence'),
    ('SALE', 'Sales Contracts', 10, 'Agreements of sale and offers to purchase'),
    ('FIN', 'Invoices & Receipts', 7, 'Invoices, receipts and statements'),
    ('GEN', 'General', 5, 'Anything else'),
]


@transaction.atomic
def seed_document_types() -> None:
    from apps.documents.models import DocumentCategory

    for order, (code, name, years, description) in enumerate(DOCUMENT_TYPES, start=1):
        DocumentCategory.objects.get_or_create(code=code, defaults={
            'name': name, 'retention_years': years, 'description': description, 'sort_order': order * 10})
