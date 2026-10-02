"""
Tenant portal API. Every view works on request.user.contact only.

  GET  portal/me/                          profile, leases, balance
  GET  portal/invoices/                    invoices and credit notes
  GET  portal/invoices/{id}/pdf/
  GET  portal/statement/                   ?from_date&to_date[&export_format=pdf]
  GET/POST portal/maintenance/             {lease, category, description, priority?}
  GET/POST portal/payments/                POST {"invoices": [ids]} -> {reference, redirect_url}
  GET  portal/payments/{reference}/
  POST portal/payments/{reference}/refresh/   poll the gateway
  POST portal/payments/{reference}/simulate/  {"outcome": "paid"|"failed"} test gateway only
  POST payments/paynow/result/             Paynow status callback (anonymous, hash-verified)
  POST auth/portal-activate/               {uid, token, password} (anonymous)
  POST crm/contacts/{id}/invite_to_portal/ staff: create the login and email the link
"""

import logging

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.finance.models import CustomerInvoice
from apps.finance.services.accounting import AccountingError
from apps.finance.statements import _dates, _pdf_response, customer_statement
from apps.portal import services
from apps.portal.gateways import GatewayError, get_gateway
from apps.portal.models import OnlinePayment
from apps.rentals.models import Lease, MaintenanceRequest

logger = logging.getLogger('stohill.portal')


def _contact(request):
    contact = getattr(request.user, 'contact', None)
    if contact is None:
        raise PermissionDenied('This login is not linked to a tenant.')
    return contact


def _invoice_row(inv):
    return {
        'id': str(inv.pk), 'number': inv.invoice_number, 'reference': inv.reference,
        'type': inv.document_type, 'invoice_date': inv.invoice_date, 'due_date': inv.due_date,
        'currency': inv.currency.code if inv.currency else None, 'total': str(inv.total_amount),
        'paid': str(inv.amount_paid), 'balance': str(inv.balance_due), 'status': inv.status,
        'payable': inv.status in services.OPEN and not inv.is_credit_note,
        'pdf_url': f'/api/v1/portal/invoices/{inv.pk}/pdf/',
    }


def _payment_row(p):
    return {'reference': p.reference, 'amount': str(p.amount), 'currency': p.currency.code if p.currency else None,
            'status': p.status, 'gateway': p.gateway, 'redirect_url': p.redirect_url,
            'created_at': p.created_at, 'allocations': p.allocations}


class PortalMeView(APIView):
    def get(self, request):
        contact = _contact(request)
        customer = services.customer_for(contact)
        leases = Lease.objects.filter(tenant=contact).exclude(status='draft').select_related('property', 'unit')
        return Response({
            'name': contact.full_name, 'email': contact.email, 'phone': contact.phone_mobile,
            'balance': str(customer.balance),
            'open_invoices': services.open_invoices(contact).count(),
            'leases': [{'id': str(lease.pk), 'lease_number': lease.lease_number, 'status': lease.status,
                        'property': lease.property.name, 'address': lease.property.full_address,
                        'unit': lease.unit.unit_number if lease.unit_id else None,
                        'start_date': lease.start_date, 'end_date': lease.end_date,
                        'monthly_rental': str(lease.monthly_rental),
                        'deposit_held': str(lease.deposit_amount) if lease.deposit_paid else '0.00'}
                       for lease in leases],
        })


class PortalInvoicesView(APIView):
    def get(self, request):
        invoices = CustomerInvoice.objects.filter(customer__contact_link=_contact(request)) \
            .exclude(status__in=[CustomerInvoice.InvoiceStatus.DRAFT, CustomerInvoice.InvoiceStatus.CANCELLED]) \
            .select_related('currency').order_by('-invoice_date')
        return Response([_invoice_row(inv) for inv in invoices])


class PortalInvoicePdfView(APIView):
    def get(self, request, pk):
        from apps.finance.services.pdf_service import generate_invoice_pdf

        invoice = get_object_or_404(CustomerInvoice, pk=pk, customer__contact_link=_contact(request))
        response = HttpResponse(generate_invoice_pdf(invoice), content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{invoice.invoice_number}.pdf"'
        return response


class PortalStatementView(APIView):
    def get(self, request):
        data = customer_statement(services.customer_for(_contact(request)), *_dates(request.query_params))
        if request.query_params.get('export_format') == 'pdf':
            return _pdf_response(data, 'Statement.pdf')
        return Response(data)


class PortalMaintenanceView(APIView):
    def get(self, request):
        requests_ = MaintenanceRequest.objects.filter(lease__tenant=_contact(request)).order_by('-created_at')
        return Response([{'reference': m.reference, 'category': m.category, 'description': m.description,
                          'priority': m.priority, 'status': m.status, 'created_at': m.created_at,
                          'completed_date': m.completed_date} for m in requests_])

    def post(self, request):
        contact = _contact(request)
        lease = get_object_or_404(Lease, pk=request.data.get('lease'), tenant=contact)
        category, description = request.data.get('category', '').strip(), request.data.get('description', '').strip()
        if not category or not description:
            raise ValidationError({'detail': 'Give a category and describe the problem.'})
        priority = request.data.get('priority') or MaintenanceRequest.Priority.MEDIUM
        if priority not in MaintenanceRequest.Priority.values:
            raise ValidationError({'priority': 'Unknown priority.'})
        job = MaintenanceRequest.objects.create(property=lease.property, lease=lease, reported_by=contact,
                                                category=category[:100], description=description,
                                                priority=priority, created_by=request.user)
        return Response({'reference': job.reference, 'status': job.status}, status=status.HTTP_201_CREATED)


class PortalPaymentsView(APIView):
    def get(self, request):
        return Response([_payment_row(p) for p in
                         OnlinePayment.objects.filter(contact=_contact(request)).select_related('currency')])

    def post(self, request):
        contact = _contact(request)
        invoices = request.data.get('invoices') or []
        return_url = f"{settings.PORTAL_BASE_URL.rstrip('/')}/portal/payments"
        result_url = request.build_absolute_uri('/api/v1/payments/paynow/result/')
        payment = services.start_payment(contact, invoices, return_url, result_url)
        return Response(_payment_row(payment), status=status.HTTP_201_CREATED)


class PortalPaymentDetailView(APIView):
    def _payment(self, request, reference):
        return get_object_or_404(OnlinePayment, reference=reference, contact=_contact(request))

    def get(self, request, reference):
        return Response(_payment_row(self._payment(request, reference)))

    def post(self, request, reference, op):
        payment = self._payment(request, reference)
        if op == 'refresh':
            if payment.status in (OnlinePayment.Status.PAID, OnlinePayment.Status.FAILED):
                return Response(_payment_row(payment))
            try:
                result = get_gateway(payment.gateway).poll(payment)
            except GatewayError as e:
                raise ValidationError({'detail': str(e)})
            payment = services.apply_status(payment, result.status, result.raw_status, result.gateway_reference,
                                            result.amount)
            return Response(_payment_row(payment))
        if op == 'simulate':
            if payment.gateway != 'test' or not settings.PAYMENT_TEST_GATEWAY_ENABLED:
                raise PermissionDenied('Simulation is only available with the test gateway.')
            outcome = request.data.get('outcome', 'paid')
            payment = services.apply_status(payment, 'paid' if outcome == 'paid' else 'failed', f'Simulated {outcome}',
                                            amount=str(payment.amount) if outcome == 'paid' else '')
            return Response(_payment_row(payment))
        raise ValidationError({'detail': 'Unknown operation.'})


class PaynowResultView(APIView):
    """Paynow posts payment status here; the hash authenticates it."""
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        try:
            gateway = get_gateway('paynow')
            result = gateway.parse_status(request.body.decode())
        except GatewayError as e:
            logger.warning('Rejected Paynow callback: %s', e)
            return HttpResponse('rejected', status=400)
        payment = OnlinePayment.objects.filter(reference=result.reference, gateway='paynow').first()
        if payment is None:
            return HttpResponse('unknown reference', status=404)
        try:
            services.apply_status(payment, result.status, result.raw_status, result.gateway_reference, result.amount)
        except AccountingError:
            logger.exception('Could not receipt Paynow payment %s', result.reference)
            return HttpResponse('error', status=500)   # Paynow retries the callback
        return HttpResponse('OK')


class PortalActivateView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        from django.core.exceptions import ValidationError as DjangoValidationError

        try:
            services.activate(request.data.get('uid', ''), request.data.get('token', ''),
                              request.data.get('password', ''))
        except DjangoValidationError as e:
            raise ValidationError({'password': e.messages})
        return Response({'status': 'activated'})


class InviteToPortalActions:
    """Mixed into the CRM contact viewset."""

    @action(detail=True, methods=['post'])
    def invite_to_portal(self, request, pk=None):
        # The activation link goes only to the tenant's email, never back to
        # staff, who could otherwise set the tenant's password themselves.
        # Body: {"kind": "tenant" (default) | "owner"}.
        user = services.invite(self.get_object(), request.user, kind=request.data.get('kind') or 'tenant')
        return Response({'status': 'invited', 'email': user.email})


class InviteSupplierToPortalActions:
    """Mixed into the supplier viewset: contractor portal login for a supplier."""

    @action(detail=True, methods=['post'])
    def invite_to_portal(self, request, pk=None):
        user = services.invite_supplier(self.get_object(), request.user)
        return Response({'status': 'invited', 'email': user.email})
