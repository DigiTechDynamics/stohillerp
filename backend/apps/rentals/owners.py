"""
Owner (landlord) trust accounting for managed properties.

Rent billed on a managed property is credited to 2210 Owner Funds Held,
tagged with the property, less the agency's management fee; repairs charged
to the owner debit the same account. The owner's balance is therefore the
credit balance of 2210 for their properties (plus payouts tagged to them).
Only rent actually collected can be paid out.

  GET  rentals/owners/                    owners with balance, uncollected and available-to-pay
  GET  rentals/owners/{id}/statement/     ?from_date&to_date[&export_format=pdf]
  POST rentals/owners/{id}/payout/        {"amount", "bank_account", "date"?}
"""

from datetime import date
from decimal import Decimal

from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.crm.models import Contact
from apps.finance.models import BankAccount, JournalEntry, JournalLine
from apps.finance.services.accounting import AccountingError, AccountingService, PostingData
from apps.finance.statements import _dates, _pdf_response, build_statement
from apps.rentals.models import RentalInvoice

ZERO = Decimal('0.00')
OWNER_FUNDS = '2210'


def owner_lines(owner):
    return JournalLine.objects.filter(account__code=OWNER_FUNDS).filter(
        Q(property_ref__owner=owner) | Q(contact_ref=owner))


def owner_balance(owner) -> Decimal:
    agg = owner_lines(owner).filter(entry__status__in=JournalEntry.LEDGER_STATUSES).aggregate(
        dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
    return (agg['cr'] or ZERO) - (agg['dr'] or ZERO)


def uncollected_owner_share(owner) -> Decimal:
    """Owner's share of rent billed but not yet received from tenants."""
    total = ZERO
    invoices = RentalInvoice.objects.filter(lease__property__owner=owner, lease__property__ownership_type='managed',
                                            balance_due__gt=0, is_posted_to_finance=True) \
        .exclude(status=RentalInvoice.InvoiceStatus.CANCELLED).select_related('lease__property')
    for inv in invoices:
        prop = inv.lease.property
        fee = (inv.rental_amount * prop.management_fee_rate / 100).quantize(Decimal('0.01'))
        owner_gross = inv.rental_amount - fee + inv.vat_amount
        if inv.total_amount:
            total += (inv.balance_due * owner_gross / inv.total_amount).quantize(Decimal('0.01'))
    return total


def owner_summary(owner) -> dict:
    balance = owner_balance(owner)
    uncollected = uncollected_owner_share(owner)
    return {'id': str(owner.pk), 'name': owner.full_name, 'email': owner.email,
            'properties': list(owner.owned_properties.values_list('reference_number', flat=True)),
            'balance': str(balance), 'uncollected': str(uncollected),
            'available_to_pay': str(max(balance - uncollected, ZERO))}


def pay_owner(owner, amount: Decimal, bank_account, on: date, user=None):
    amount = Decimal(amount)
    available = owner_balance(owner) - uncollected_owner_share(owner)
    if amount <= 0 or amount > available:
        raise AccountingError(f'Payout must be between 0 and the collected balance available ({available}).')
    posting = PostingData(description=f'Owner payout - {owner.full_name}', entry_date=on,
                          source_module='owner_payout', source_id=owner.pk,
                          source_reference=f'OWNPAY-{owner.last_name.upper()}-{on:%Y%m%d}')
    posting.add_debit(OWNER_FUNDS, amount, 'Paid to owner', contact_ref=owner)
    posting.add_credit(bank_account.gl_account.code, amount, f'Owner payout {owner.full_name}')
    return AccountingService(user=user).post_entry(posting, journal_code='RJ')


class OwnerViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Contact.objects.filter(owned_properties__isnull=False).distinct().order_by('last_name')

    def list(self, request, *args, **kwargs):
        return Response({'results': [owner_summary(o) for o in self.get_queryset()]})

    def retrieve(self, request, *args, **kwargs):
        return Response(owner_summary(self.get_object()))

    @action(detail=True, methods=['get'])
    def statement(self, request, pk=None):
        owner = self.get_object()
        from_date, to_date = _dates(request.query_params)
        party = {'id': str(owner.pk), 'name': owner.full_name, 'reference': str(owner.pk)[:8].upper(),
                 'email': owner.email}
        data = build_statement(owner_lines(owner), Decimal('-1'), from_date, to_date, party, aging={})
        data.update({k: v for k, v in owner_summary(owner).items() if k in ('uncollected', 'available_to_pay')})
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
