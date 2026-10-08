"""
Owner (landlord) trust accounting for managed properties.

Rent billed on a managed property is credited to 2210 Owner Funds Held,
tagged with the property, less the agency's management fee; repairs charged
to the owner debit the same account. An owner's balance is their share of
the 2210 balance of each property they own, plus payouts tagged to them.

A property's owners are its PropertyOwnership shares when it has any
(multi-owner split); otherwise its single `owner` holds 100%.
Only rent actually collected can be paid out.

  GET  rentals/owners/                    owners with balance, uncollected and available-to-pay
  GET  rentals/owners/{id}/statement/     ?from_date&to_date[&export_format=pdf]
  POST rentals/owners/{id}/payout/        {"amount", "bank_account", "date"?}
"""

from datetime import date
from decimal import Decimal

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.crm.models import Contact
from apps.finance.models import BankAccount, JournalEntry, JournalLine
from apps.finance.services.accounting import AccountingError, AccountingService, PostingData, system_account_code
from apps.finance.statements import _dates, _pdf_response, build_statement
from apps.rentals.models import RentalInvoice

ZERO = Decimal('0.00')
ONE = Decimal('1')
CENT = Decimal('0.01')


def owner_funds_code() -> str:
    """The trust liability holding owners' money (posting profile 'owner funds', starter chart 2210)."""
    return system_account_code('OWNER_FUNDS')


def owner_shares(owner) -> dict:
    """{property_id: fraction of the property this owner holds}."""
    from apps.properties.models import Property, PropertyOwnership

    shares = {o.property_id: o.share_percent / 100 for o in PropertyOwnership.objects.filter(owner=owner)}
    sole = Property.objects.filter(owner=owner, ownerships__isnull=True).values_list('id', flat=True)
    for pid in sole:
        shares.setdefault(pid, ONE)
    return shares


def owners_queryset():
    return Contact.objects.filter(Q(owned_properties__isnull=False) | Q(property_shares__isnull=False)) \
        .distinct().order_by('last_name', 'first_name')


def owner_lines(owner, shares=None):
    shares = owner_shares(owner) if shares is None else shares
    return JournalLine.objects.filter(account__code=owner_funds_code()).filter(
        Q(property_ref_id__in=list(shares)) | Q(contact_ref=owner, property_ref__isnull=True))


def _weight(shares):
    return lambda line: shares.get(line.property_ref_id, ONE) if line.property_ref_id else ONE


def owner_balance(owner) -> Decimal:
    shares = owner_shares(owner)
    weight = _weight(shares)
    total = ZERO
    for line in owner_lines(owner, shares).filter(entry__status__in=JournalEntry.LEDGER_STATUSES) \
            .only('amount', 'side', 'property_ref_id'):
        signed = line.amount if line.side == 'credit' else -line.amount
        total += signed * weight(line)
    return total.quantize(CENT)


def uncollected_owner_share(owner) -> Decimal:
    """Owner's share of rent billed but not yet received from tenants."""
    shares = owner_shares(owner)
    total = ZERO
    invoices = RentalInvoice.objects.filter(lease__property_id__in=list(shares),
                                            lease__property__ownership_type='managed',
                                            balance_due__gt=0, is_posted_to_finance=True) \
        .exclude(status=RentalInvoice.InvoiceStatus.CANCELLED).select_related('lease__property')
    for inv in invoices:
        prop = inv.lease.property
        fee = (inv.rental_amount * prop.management_fee_rate / 100).quantize(CENT)
        owner_gross = inv.rental_amount - fee + inv.vat_amount
        if inv.total_amount:
            total += (inv.balance_due * owner_gross / inv.total_amount * shares[prop.pk]).quantize(CENT)
    return total


def owner_summary(owner) -> dict:
    from apps.properties.models import Property

    shares = owner_shares(owner)
    balance = owner_balance(owner)
    uncollected = uncollected_owner_share(owner)
    props = Property.objects.filter(pk__in=list(shares)).values_list('pk', 'reference_number')
    return {'id': str(owner.pk), 'name': owner.full_name, 'email': owner.email,
            'properties': [ref for _pk, ref in props],
            'shares': {ref: str((shares[pk] * 100).quantize(CENT)) for pk, ref in props},
            'balance': str(balance), 'uncollected': str(uncollected),
            'available_to_pay': str(max(balance - uncollected, ZERO))}


def available_to_pay(owner) -> Decimal:
    return max(owner_balance(owner) - uncollected_owner_share(owner), ZERO)


def pay_owner(owner, amount: Decimal, bank_account, on: date, user=None):
    amount = Decimal(amount)
    available = owner_balance(owner) - uncollected_owner_share(owner)
    if amount <= 0 or amount > available:
        raise AccountingError(f'Payout must be between 0 and the collected balance available ({available}).')
    posting = PostingData(description=f'Owner payout - {owner.full_name}', entry_date=on,
                          source_module='owner_payout', source_id=owner.pk,
                          source_reference=f'OWNPAY-{owner.last_name.upper()}-{on:%Y%m%d}')
    posting.add_debit(owner_funds_code(), amount, 'Paid to owner', contact_ref=owner)
    posting.add_credit(bank_account.gl_account.code, amount, f'Owner payout {owner.full_name}')
    return AccountingService(user=user).post_entry(posting, journal_code='RJ')


def owner_statement(owner, from_date, to_date):
    shares = owner_shares(owner)
    party = {'id': str(owner.pk), 'name': owner.full_name, 'reference': str(owner.pk)[:8].upper(),
             'email': owner.email}
    data = build_statement(owner_lines(owner, shares), Decimal('-1'), from_date, to_date, party, aging={},
                           weight=_weight(shares))
    data.update({k: v for k, v in owner_summary(owner).items() if k in ('uncollected', 'available_to_pay', 'shares')})
    return data


class OwnerViewSet(viewsets.ReadOnlyModelViewSet):
    def get_queryset(self):
        return owners_queryset()

    def list(self, request, *args, **kwargs):
        return Response({'results': [owner_summary(o) for o in self.get_queryset()]})

    def retrieve(self, request, *args, **kwargs):
        return Response(owner_summary(self.get_object()))

    @action(detail=True, methods=['get'])
    def statement(self, request, pk=None):
        owner = self.get_object()
        from_date, to_date = _dates(request.query_params)
        data = owner_statement(owner, from_date, to_date)
        if request.query_params.get('export_format') == 'pdf':
            return _pdf_response(data, f'Owner_Statement_{owner.pk}.pdf', 'OWNER STATEMENT')
        return Response(data)

    @action(detail=True, methods=['post'])
    def payout(self, request, pk=None):
        owner = self.get_object()
        bank = get_object_or_404(BankAccount, pk=request.data.get('bank_account'))
        try:
            on = date.fromisoformat(request.data['date']) if request.data.get('date') else timezone.localdate()
        except ValueError:
            raise ValidationError({'date': 'Use YYYY-MM-DD.'})
        entry = pay_owner(owner, request.data.get('amount') or '0', bank, on, request.user)
        return Response({'journal_entry': entry.reference, **owner_summary(owner)})
