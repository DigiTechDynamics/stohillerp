"""
Agency fees charged to the owner of a managed property, out of the owner's
trust balance (Dr 2210 Owner Funds Held, tagged with the property /
Cr 4300 Property Management Fees):

- letting fee: % of the first month's rent when a new lease starts
- procurement fee: % of a maintenance job charged to the owner
"""

from decimal import Decimal

from django.utils import timezone

from apps.finance.services.accounting import AccountingService, PostingData

CENT = Decimal('0.01')


def _post_fee(prop, amount, description, reference, source_id, user=None, on=None):
    posting = PostingData(description=description, entry_date=on or timezone.localdate(),
                          source_module='agency_fee', source_id=source_id, source_reference=reference)
    posting.add_debit('2210', amount, description, property_ref=prop)
    posting.add_credit('4300', amount, description, property_ref=prop)
    return AccountingService(user=user).post_entry(posting, journal_code='RJ')


def charge_letting_fee(lease, user=None):
    """Once per lease, when it is active on a managed property with a letting fee."""
    from apps.rentals.models import Lease

    prop = lease.property
    if lease.letting_fee_charged or lease.status != Lease.LeaseStatus.ACTIVE or not prop.is_managed \
            or not prop.letting_fee_percent:
        return None
    amount = (lease.monthly_rental * prop.letting_fee_percent / 100).quantize(CENT)
    if amount <= 0:
        return None
    entry = _post_fee(prop, amount, f'Letting fee {prop.letting_fee_percent}% - {lease.lease_number}',
                      f'LETFEE-{lease.lease_number}', lease.pk, user)
    Lease.objects.filter(pk=lease.pk).update(letting_fee_charged=True)
    lease.letting_fee_charged = True
    return entry


def charge_procurement_fee(prop, cost, job, user=None):
    if not prop or not prop.is_managed or not prop.procurement_fee_percent:
        return None
    amount = (Decimal(cost) * prop.procurement_fee_percent / 100).quantize(CENT)
    if amount <= 0:
        return None
    return _post_fee(prop, amount, f'Procurement fee {prop.procurement_fee_percent}% - {job.reference}',
                     f'PROCFEE-{job.reference}', job.pk, user)
