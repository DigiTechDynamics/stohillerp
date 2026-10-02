"""
Owner portal (prefix owner-portal/). Every view works on request.user.contact only.

  GET  me/                          balance, available to pay, properties and shares
  GET  statement/                   ?from_date&to_date[&export_format=pdf]
  GET  properties/                  per property: rent billed and collected (owner's share), costs, occupancy
  GET  maintenance/                 jobs on the owner's properties
  GET  quotes/                      quotes waiting for the owner's approval
  POST quotes/{id}/decide/          {"approve": true|false, "note"?}
"""

from decimal import Decimal

from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.finance.statements import _dates, _pdf_response
from apps.propman.models import MaintenanceQuote
from apps.propman.services.maintenance import owner_decision
from apps.rentals.owners import owner_shares, owner_statement, owner_summary

ZERO = Decimal('0.00')


def _owner(request):
    contact = getattr(request.user, 'contact', None)
    if contact is None or not owner_shares(contact):
        raise PermissionDenied('This login is not linked to a property owner.')
    return contact


class OwnerMeView(APIView):
    def get(self, request):
        owner = _owner(request)
        return Response({**owner_summary(owner), 'bank_name': owner.bank_name,
                         'bank_account_number': owner.bank_account_number[-4:].rjust(len(owner.bank_account_number), '•')
                         if owner.bank_account_number else ''})


class OwnerStatementView(APIView):
    def get(self, request):
        owner = _owner(request)
        data = owner_statement(owner, *_dates(request.query_params))
        if request.query_params.get('export_format') == 'pdf':
            return _pdf_response(data, 'Owner_Statement.pdf', 'OWNER STATEMENT')
        return Response(data)


class OwnerPropertiesView(APIView):
    def get(self, request):
        from apps.finance.models import JournalEntry, JournalLine
        from apps.properties.models import Property
        from apps.rentals.models import Lease, RentalInvoice

        owner = _owner(request)
        shares = owner_shares(owner)
        date_from, date_to = _dates(request.query_params)
        rows = []
        for prop in Property.objects.filter(pk__in=list(shares)).prefetch_related('units'):
            share = shares[prop.pk]
            invoices = RentalInvoice.objects.filter(lease__property=prop, period_start__range=(date_from, date_to)) \
                .exclude(status=RentalInvoice.InvoiceStatus.CANCELLED)
            billed = invoices.aggregate(t=Sum('rental_amount'))['t'] or ZERO
            collected = invoices.aggregate(t=Sum('amount_paid'))['t'] or ZERO
            costs = JournalLine.objects.filter(
                account__code='2210', property_ref=prop, side='debit', entry__status__in=JournalEntry.LEDGER_STATUSES,
                entry__entry_date__range=(date_from, date_to)).aggregate(t=Sum('amount'))['t'] or ZERO
            units = list(prop.units.all())
            occupied = sum(1 for u in units if u.status == 'occupied') if units else \
                int(Lease.objects.filter(property=prop, status='active').exists())
            rows.append({
                'id': str(prop.pk), 'reference': prop.reference_number, 'name': prop.name,
                'address': prop.full_address, 'share_percent': str((share * 100).quantize(Decimal('0.01'))),
                'rent_billed': str((billed * share).quantize(Decimal('0.01'))),
                'rent_collected': str((collected * share).quantize(Decimal('0.01'))),
                'costs_charged': str((costs * share).quantize(Decimal('0.01'))),
                'units': len(units) or 1, 'occupied': occupied,
                'active_leases': Lease.objects.filter(property=prop, status='active').count(),
            })
        return Response({'from_date': str(date_from), 'to_date': str(date_to), 'properties': rows})


class OwnerMaintenanceView(APIView):
    def get(self, request):
        from apps.rentals.models import MaintenanceRequest

        owner = _owner(request)
        ids = list(owner_shares(owner))
        jobs = MaintenanceRequest.objects.filter(Q(property_id__in=ids) | Q(lease__property_id__in=ids)) \
            .select_related('property', 'lease__property').order_by('-created_at')[:100]
        return Response([{'reference': j.reference, 'property': (j.property or j.lease.property).name,
                          'category': j.category, 'description': j.description, 'status': j.status,
                          'priority': j.priority, 'estimated_cost': j.estimated_cost, 'actual_cost': j.actual_cost,
                          'created_at': j.created_at, 'completed_date': j.completed_date} for j in jobs])


class OwnerQuotesView(APIView):
    def get(self, request):
        owner = _owner(request)
        ids = list(owner_shares(owner))
        quotes = MaintenanceQuote.objects.filter(
            Q(request__property_id__in=ids) | Q(request__lease__property_id__in=ids),
            status=MaintenanceQuote.Status.AWAITING_OWNER).select_related('supplier', 'request__property')
        return Response([{'id': str(q.pk), 'job': q.request.reference, 'category': q.request.category,
                          'description': q.request.description, 'supplier': q.supplier.name, 'amount': str(q.amount),
                          'quote_notes': q.description, 'valid_until': q.valid_until,
                          'property': (q.request.property or q.request.lease.property).name} for q in quotes])


class OwnerQuoteDecisionView(APIView):
    def post(self, request, pk):
        owner = _owner(request)
        quote = get_object_or_404(MaintenanceQuote, pk=pk)
        approve = request.data.get('approve') in (True, 'true', 'True', '1', 1)
        quote = owner_decision(quote, owner, approve, request.data.get('note', ''))
        return Response({'status': quote.status, 'decided_at': timezone.now()})
