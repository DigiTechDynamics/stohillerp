"""
Lettings: tenant applications (credit check, approval, conversion to a draft
lease) and lease signature (send / signed) through the provider hooks.
"""

from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.finance.services.accounting import AccountingError
from apps.propman.integrations import credit_bureau, signature_service
from apps.propman.models import TenantApplication


def request_credit_check(application, user=None):
    bureau = credit_bureau()
    application.credit_reference = bureau.request(application) or application.credit_reference
    application.credit_provider = getattr(bureau, 'name', '')
    application.credit_status = TenantApplication.CreditStatus.PENDING
    if application.status == TenantApplication.Status.NEW:
        application.status = TenantApplication.Status.SCREENING
    application.save()
    return application


def record_credit_result(application, status, score=None, reference='', notes='', user=None):
    if status not in (TenantApplication.CreditStatus.CLEAR, TenantApplication.CreditStatus.ADVERSE,
                      TenantApplication.CreditStatus.ERROR):
        raise AccountingError('Result must be clear, adverse or error.')
    application.credit_status, application.credit_score = status, score
    application.credit_reference = reference or application.credit_reference
    application.credit_notes, application.credit_checked_at = notes, timezone.now()
    application.save()
    return application


def decide(application, approve, note='', user=None):
    if application.status in (TenantApplication.Status.CONVERTED, TenantApplication.Status.WITHDRAWN):
        raise AccountingError(f'The application is already {application.get_status_display().lower()}.')
    application.status = TenantApplication.Status.APPROVED if approve else TenantApplication.Status.DECLINED
    if note:
        application.notes = f'{application.notes}\n{note}'.strip()
    application.save()
    return application


@transaction.atomic
def convert_to_lease(application, start_date, monthly_rental=None, deposit=None, end_date=None, user=None):
    """Create a draft lease for an approved application and reserve the unit."""
    from apps.properties.models import PropertyUnit
    from apps.rentals.models import Lease

    if application.status != TenantApplication.Status.APPROVED:
        raise AccountingError('Only approved applications can become a lease.')
    rent = Decimal(str(monthly_rental)) if monthly_rental not in (None, '') else \
        (application.offered_rent or (application.unit.monthly_rental if application.unit_id else None))
    if not rent:
        raise AccountingError('Give the monthly rent.')
    lease = Lease.objects.create(
        property=application.property, unit=application.unit, tenant=application.applicant,
        currency=application.property.currency, start_date=start_date, end_date=end_date or None,
        monthly_rental=rent, deposit_amount=Decimal(str(deposit)) if deposit not in (None, '') else rent,
        status=Lease.LeaseStatus.DRAFT, created_by=user)
    application.status, application.lease = TenantApplication.Status.CONVERTED, lease
    application.save(update_fields=['status', 'lease', 'updated_at'])
    if application.unit_id:
        PropertyUnit.objects.filter(pk=application.unit_id, status=PropertyUnit.UnitStatus.AVAILABLE) \
            .update(status=PropertyUnit.UnitStatus.RESERVED)
        # The unit is taken: other open applications for it are declined.
        TenantApplication.objects.filter(
            unit=application.unit,
            status__in=[TenantApplication.Status.NEW, TenantApplication.Status.SCREENING],
        ).exclude(pk=application.pk).update(status=TenantApplication.Status.DECLINED)
    return lease


def send_for_signature(lease, user=None):
    from apps.rentals.models import Lease

    if not lease.tenant_id or not lease.tenant.email:
        raise AccountingError('The tenant needs an email address to sign.')
    if lease.signature_status == Lease.SignatureStatus.SIGNED:
        raise AccountingError('This lease is already signed.')
    service = signature_service()
    lease.signature_reference = service.send(lease, lease.tenant.email) or lease.signature_reference
    lease.signature_provider = getattr(service, 'name', '')
    lease.signature_status, lease.signature_sent_at = Lease.SignatureStatus.SENT, timezone.now()
    if lease.status == Lease.LeaseStatus.DRAFT:
        lease.status = Lease.LeaseStatus.PENDING_SIGNATURE
    lease.save()
    return lease


def mark_signed(lease, signed=True, user=None):
    from apps.rentals.models import Lease

    if lease.signature_status not in (Lease.SignatureStatus.SENT, Lease.SignatureStatus.NOT_SENT):
        raise AccountingError('The lease is not waiting for a signature.')
    lease.signature_status = Lease.SignatureStatus.SIGNED if signed else Lease.SignatureStatus.DECLINED
    lease.signature_signed_at = timezone.now() if signed else None
    lease.save()
    return lease
