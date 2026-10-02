"""
Contractor portal (prefix contractor-portal/). Every view works on request.user.supplier only.

  GET   me/                    the supplier
  GET   jobs/                  jobs assigned to the contractor, plus open jobs they may quote for (?open=1)
  PATCH jobs/{reference}/      {"status": "acknowledged"|"in_progress"|"pending_parts", "notes"?}
  POST  jobs/{reference}/done/ {"notes"?}  report the work done; staff complete and bill it
  GET   quotes/                the contractor's quotes
  POST  quotes/                {"job": reference, "amount", "description"?, "valid_until"?, document?}
"""

from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.propman.models import MaintenanceQuote

CONTRACTOR_STATUSES = ('acknowledged', 'in_progress', 'pending_parts')


def _supplier(request):
    supplier = getattr(request.user, 'supplier', None)
    if supplier is None:
        raise PermissionDenied('This login is not linked to a contractor.')
    return supplier


def _job_row(job):
    prop = job.property or (job.lease.property if job.lease_id else None)
    return {'reference': job.reference, 'property': prop.name if prop else '',
            'address': prop.full_address if prop else '',
            'unit': job.lease.unit.unit_number if job.lease_id and job.lease.unit_id else None,
            'category': job.category, 'description': job.description, 'priority': job.priority,
            'status': job.status, 'scheduled_date': job.scheduled_date, 'estimated_cost': job.estimated_cost,
            'notes': job.resolution_notes, 'created_at': job.created_at}


def _open_jobs():
    from apps.rentals.models import MaintenanceRequest
    return MaintenanceRequest.objects.filter(contractor__isnull=True, status__in=['logged', 'acknowledged'])


class ContractorMeView(APIView):
    def get(self, request):
        s = _supplier(request)
        return Response({'id': str(s.pk), 'name': s.name, 'email': s.email, 'phone': s.phone})


class ContractorJobsView(APIView):
    def get(self, request):
        from apps.rentals.models import MaintenanceRequest

        s = _supplier(request)
        qs = _open_jobs() if request.query_params.get('open') else \
            MaintenanceRequest.objects.filter(contractor=s).exclude(status='cancelled')
        qs = qs.select_related('property', 'lease__property', 'lease__unit').order_by('-created_at')[:200]
        return Response([_job_row(j) for j in qs])


class ContractorJobView(APIView):
    def _job(self, request, reference):
        from apps.rentals.models import MaintenanceRequest
        return get_object_or_404(MaintenanceRequest, reference=reference, contractor=_supplier(request))

    def patch(self, request, reference):
        job = self._job(request, reference)
        if job.status in ('completed', 'closed', 'cancelled'):
            raise ValidationError({'detail': 'This job is closed.'})
        status = request.data.get('status')
        if status:
            if status not in CONTRACTOR_STATUSES:
                raise ValidationError({'status': f'Choose one of: {", ".join(CONTRACTOR_STATUSES)}.'})
            job.status = status
        if request.data.get('notes'):
            stamp = timezone.localtime().strftime('%Y-%m-%d %H:%M')
            job.resolution_notes = f'{job.resolution_notes}\n[{stamp}] {request.data["notes"]}'.strip()
        job.save()
        return Response(_job_row(job))


class ContractorJobDoneView(ContractorJobView):
    http_method_names = ['post', 'options']

    def post(self, request, reference):
        """Report the work done: staff are notified to inspect, complete and bill the job."""
        from apps.notifications.services import send_email

        job = self._job(request, reference)
        if job.status in ('completed', 'closed', 'cancelled'):
            raise ValidationError({'detail': 'This job is closed.'})
        stamp = timezone.localtime().strftime('%Y-%m-%d %H:%M')
        job.resolution_notes = (f'{job.resolution_notes}\n[{stamp}] Contractor reported the work done. '
                                f'{request.data.get("notes", "")}').strip()
        job.save(update_fields=['resolution_notes', 'updated_at'])
        to = settings.COMPANY_CONFIG.get('email', '')
        send_email(to, f'Work reported done: {job.reference}',
                   f'{job.contractor.name} reports job {job.reference} ({job.category}) done. '
                   f'{request.data.get("notes", "")}\nComplete it in Rental Management to raise their bill.',
                   category='contractor', related=f'maintenance:{job.reference}')
        return Response(_job_row(job))


class ContractorQuotesView(APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get(self, request):
        s = _supplier(request)
        quotes = MaintenanceQuote.objects.filter(supplier=s).select_related('request').order_by('-created_at')
        return Response([{'id': q.pk, 'job': q.request.reference, 'category': q.request.category,
                          'amount': str(q.amount), 'status': q.status, 'valid_until': q.valid_until,
                          'created_at': q.created_at} for q in quotes])

    def post(self, request):
        from decimal import Decimal, InvalidOperation

        from apps.rentals.models import MaintenanceRequest

        s = _supplier(request)
        job = get_object_or_404(MaintenanceRequest, reference=request.data.get('job'))
        if job.contractor_id not in (None, s.pk) or (job.contractor_id is None and not _open_jobs().filter(pk=job.pk).exists()):
            raise PermissionDenied('You cannot quote for this job.')
        try:
            amount = Decimal(str(request.data.get('amount')))
        except (InvalidOperation, TypeError):
            raise ValidationError({'amount': 'Give the quoted amount.'})
        if amount <= 0:
            raise ValidationError({'amount': 'The quote must be greater than zero.'})
        valid_until = request.data.get('valid_until') or None
        quote = MaintenanceQuote.objects.create(
            request=job, supplier=s, amount=amount, description=request.data.get('description', ''),
            valid_until=valid_until, document=request.FILES.get('document'), created_by=request.user)
        return Response({'id': quote.pk, 'status': quote.status}, status=201)
