"""
Statements of account for customers and suppliers (JSON, PDF, email).

Built from the GL control-account lines tagged with the party, so every
movement appears (invoices, credit notes, receipts, refunds, write-offs,
exchange differences) with a running balance in base currency. The aging
summary comes from the open documents.
"""

from datetime import date
from decimal import Decimal

from django.db.models import Q, Sum
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from apps.core.company import base_currency_code
from apps.finance.models import JournalEntry, JournalLine
from apps.finance.services.fx import base_currency

ZERO = Decimal('0.00')


def _dates(params):
    try:
        to_date = date.fromisoformat(params['to_date']) if params.get('to_date') else timezone.localdate()
        from_date = date.fromisoformat(params['from_date']) if params.get('from_date') \
            else to_date.replace(day=1)
    except ValueError:
        raise ValidationError({'detail': 'Dates must be YYYY-MM-DD.'})
    return from_date, to_date


def build_statement(lines_qs, sign, from_date, to_date, party, aging, weight=None):
    """
    sign=+1: balance = debits - credits (AR); -1: credits - debits (AP).
    weight(line) -> fraction scales each line (an owner's share of a property).
    """
    ledger = lines_qs.filter(entry__status__in=JournalEntry.LEDGER_STATUSES)
    if weight is None:
        opening = ledger.filter(entry__entry_date__lt=from_date).aggregate(
            dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
        balance = ((opening['dr'] or ZERO) - (opening['cr'] or ZERO)) * sign
    else:
        balance = sum(((ln.amount if ln.side == 'debit' else -ln.amount) * weight(ln)
                       for ln in ledger.filter(entry__entry_date__lt=from_date)), ZERO).quantize(ZERO) * sign
    opening_balance = balance
    out = []
    for line in ledger.filter(entry__entry_date__range=(from_date, to_date)).select_related('entry') \
            .order_by('entry__entry_date', 'entry__posted_at', 'entry__reference'):
        factor = weight(line) if weight else 1
        dr = (line.amount * factor).quantize(ZERO) if line.side == 'debit' else ZERO
        cr = (line.amount * factor).quantize(ZERO) if line.side == 'credit' else ZERO
        balance += (dr - cr) * sign
        out.append({
            'date': line.entry.entry_date.isoformat(),
            'reference': line.entry.source_reference or line.entry.reference,
            'description': line.entry.description,
            'debit': str(dr), 'credit': str(cr), 'balance': str(balance),
        })
    base = base_currency()
    return {
        'party': party,
        'currency': base.code if base else base_currency_code(),
        'from_date': from_date.isoformat(), 'to_date': to_date.isoformat(),
        'opening_balance': str(opening_balance), 'lines': out, 'closing_balance': str(balance),
        'aging': aging,
    }


def _party_aging(kind, party_id, as_at):
    from apps.finance.reports import AgingReportView
    view = AgingReportView()
    view.kind = kind
    row = next((r for r in view.build(as_at)['rows'] if r['id'] == str(party_id)), None)
    return {k: v for k, v in row.items() if k not in ('id', 'name', 'invoices')} if row else {}


def customer_statement(customer, from_date, to_date):
    from apps.finance.services.accounting import AccountingService

    ar_codes = {customer.ar_account.code, AccountingService().ACCOUNTS['ACCOUNTS_RECEIVABLE']}
    lines = JournalLine.objects.filter(contact_ref=customer.contact_link, account__code__in=ar_codes) \
        if customer.contact_link_id else JournalLine.objects.none()
    contact = customer.contact_link
    party = {'id': str(customer.pk), 'name': str(customer), 'reference': str(customer.pk)[:8].upper(),
             'email': contact.email if contact else ''}
    return build_statement(lines, Decimal('1'), from_date, to_date, party,
                           _party_aging('ar', customer.pk, to_date))


def supplier_statement(supplier, from_date, to_date):
    from apps.finance.services.accounting import AccountingService

    ap_codes = {AccountingService().ACCOUNTS['ACCOUNTS_PAYABLE']}
    if supplier.ap_account_id:
        ap_codes.add(supplier.ap_account.code)
    lines = JournalLine.objects.filter(supplier_ref=supplier, account__code__in=ap_codes)
    party = {'id': str(supplier.pk), 'name': supplier.name, 'reference': str(supplier.pk)[:8].upper(),
             'email': supplier.email}
    return build_statement(lines, Decimal('-1'), from_date, to_date, party,
                           _party_aging('ap', supplier.pk, to_date))


def _pdf_response(statement, filename, title='STATEMENT OF ACCOUNT'):
    from apps.finance.services.pdf_service import generate_account_statement_pdf
    response = HttpResponse(generate_account_statement_pdf(statement, title), content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


class CustomerStatementActions:
    """GET customers/{id}/statement/?from_date&to_date[&export_format=pdf]; POST .../email_statement/"""

    @action(detail=True, methods=['get'])
    def statement(self, request, pk=None):
        customer = self.get_object()
        data = customer_statement(customer, *_dates(request.query_params))
        if request.query_params.get('export_format') == 'pdf':
            return _pdf_response(data, f'Statement_{customer.pk}.pdf')
        return Response(data)

    @action(detail=True, methods=['post'])
    def email_statement(self, request, pk=None):
        from django.core.mail import EmailMessage

        from apps.finance.services.pdf_service import generate_account_statement_pdf

        customer = self.get_object()
        data = customer_statement(customer, *_dates(request.data))
        to = data['party']['email']
        if not to:
            raise ValidationError({'detail': 'The customer has no email address.'})
        message = EmailMessage(subject=f"Statement of account {data['from_date']} to {data['to_date']}",
                               body=f"Dear {data['party']['name']},\n\nPlease find your statement attached. "
                                    f"Closing balance: {data['currency']} {data['closing_balance']}.\n",
                               to=[to])
        message.attach('Statement.pdf', generate_account_statement_pdf(data), 'application/pdf')
        message.send()
        return Response({'status': 'sent', 'to': to})


class SupplierStatementActions:
    @action(detail=True, methods=['get'])
    def statement(self, request, pk=None):
        supplier = self.get_object()
        data = supplier_statement(supplier, *_dates(request.query_params))
        if request.query_params.get('export_format') == 'pdf':
            return _pdf_response(data, f'Supplier_Statement_{supplier.pk}.pdf', 'SUPPLIER STATEMENT')
        return Response(data)
