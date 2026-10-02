"""
Bulk distribution: e-mail rental invoices after billing, statements to all
tenants or owners of a property, and free-text messages (email and/or SMS)
to the tenants or owners of a property or portfolio.
"""

from django.conf import settings
from django.db.models import Q
from django.utils import timezone

from apps.notifications.services import notify_contact, send_email


def _invoice_pdf(rental_invoice):
    from apps.finance.models import CustomerInvoice
    from apps.finance.services.pdf_service import generate_invoice_pdf

    ar = CustomerInvoice.objects.filter(invoice_number=f'AR-{rental_invoice.invoice_number}').first()
    return generate_invoice_pdf(ar) if ar else None


def email_rental_invoices(invoices, user=None) -> dict:
    sent = skipped = 0
    company = settings.COMPANY_CONFIG.get('name', '')
    for inv in invoices:
        tenant = inv.lease.tenant
        pdf = _invoice_pdf(inv)
        if not tenant or not tenant.email or pdf is None:
            skipped += 1
            continue
        currency = inv.currency.code if inv.currency_id else settings.COMPANY_CONFIG.get('currency', '')
        send_email(tenant.email, f'Invoice {inv.invoice_number} from {company}',
                   f'Dear {tenant.first_name},\n\nPlease find attached invoice {inv.invoice_number} for '
                   f'{inv.period_start:%B %Y}: {currency} {inv.total_amount:,.2f}, due {inv.due_date:%d %B %Y}.'
                   f'\n\nRegards,\n{company}',
                   contact=tenant, category='invoice', related=f'invoice:{inv.invoice_number}', user=user,
                   attachments=[(f'{inv.invoice_number}.pdf', pdf, 'application/pdf')])
        sent += 1
    return {'sent': sent, 'skipped': skipped}


def email_invoices_for_period(period_start, property_id=None, user=None) -> dict:
    from apps.rentals.models import RentalInvoice

    qs = RentalInvoice.objects.filter(period_start=period_start, is_posted_to_finance=True) \
        .exclude(status=RentalInvoice.InvoiceStatus.CANCELLED).select_related('lease__tenant', 'currency')
    if property_id:
        qs = qs.filter(lease__property_id=property_id)
    return email_rental_invoices(qs, user)


def recipients(audience, property_id=None, portfolio_id=None):
    """Tenants (active leases) or owners of a property / portfolio / everything."""
    from apps.crm.models import Contact
    from apps.rentals.models import Lease

    if audience == 'tenants':
        leases = Lease.objects.filter(status=Lease.LeaseStatus.ACTIVE, tenant__isnull=False)
        if property_id:
            leases = leases.filter(property_id=property_id)
        if portfolio_id:
            leases = leases.filter(property__portfolio_id=portfolio_id)
        return Contact.objects.filter(pk__in=leases.values('tenant_id')).distinct()
    if audience == 'owners':
        owners = Contact.objects.filter(Q(owned_properties__isnull=False) | Q(property_shares__isnull=False))
        if property_id:
            owners = owners.filter(Q(owned_properties__id=property_id) | Q(property_shares__property_id=property_id))
        if portfolio_id:
            owners = owners.filter(Q(owned_properties__portfolio_id=portfolio_id) |
                                   Q(property_shares__property__portfolio_id=portfolio_id))
        return owners.distinct()
    raise ValueError('audience must be tenants or owners')


def send_bulk_message(audience, subject, body, channels=('email',), property_id=None, portfolio_id=None, user=None):
    sent = []
    for contact in recipients(audience, property_id, portfolio_id):
        sent += notify_contact(contact, subject, body, channels=channels, category='bulk',
                               related=f'{audience}:{property_id or portfolio_id or "all"}', user=user)
    by_status = {}
    for m in sent:
        by_status[m.status] = by_status.get(m.status, 0) + 1
    return {'recipients': len({m.contact_id for m in sent}), 'messages': len(sent), 'by_status': by_status}


def email_statements(audience, property_id=None, portfolio_id=None, from_date=None, to_date=None, user=None) -> dict:
    """Customer statements to tenants, or owner statements to owners, as PDF attachments."""
    from apps.finance.services.pdf_service import generate_account_statement_pdf
    from apps.finance.statements import customer_statement
    from apps.rentals.owners import owner_statement
    from apps.rentals.services.finance_sync import RentalFinanceSyncService

    to_date = to_date or timezone.localdate()
    from_date = from_date or to_date.replace(day=1)
    company = settings.COMPANY_CONFIG.get('name', '')
    sent = skipped = 0
    for contact in recipients(audience, property_id, portfolio_id):
        if not contact.email:
            skipped += 1
            continue
        if audience == 'tenants':
            data = customer_statement(RentalFinanceSyncService.sync_tenant_to_customer(contact), from_date, to_date)
            pdf, title = generate_account_statement_pdf(data), 'Statement of account'
        else:
            data = owner_statement(contact, from_date, to_date)
            pdf, title = generate_account_statement_pdf(data, 'OWNER STATEMENT'), 'Owner statement'
        send_email(contact.email, f'{title} {from_date:%d %b} – {to_date:%d %b %Y}',
                   f'Dear {contact.first_name},\n\nPlease find your {title.lower()} attached.\n\nRegards,\n{company}',
                   contact=contact, category='statement', related=f'{audience}:statement', user=user,
                   attachments=[(f'Statement_{to_date}.pdf', pdf, 'application/pdf')])
        sent += 1
    return {'sent': sent, 'skipped': skipped}
