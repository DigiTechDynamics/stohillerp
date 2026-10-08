"""
Contractor quotes (with owner approval above a limit on managed properties)
and planned / preventive maintenance.

Accepting a quote assigns the contractor to the job, rejects the other
quotes and raises a purchase order for the work (issued when no approval
rule stops it), so the contractor's invoice is matched to it later.
"""

from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.finance.services.accounting import AccountingError
from apps.propman.models import MaintenancePlan, MaintenanceQuote


def needs_owner_approval(quote) -> bool:
    job = quote.request
    prop = job.property or (job.lease.property if job.lease_id else None)
    limit = Decimal(str(getattr(settings, 'MAINTENANCE_OWNER_APPROVAL_LIMIT', 0) or 0))
    return bool(prop and prop.is_managed and quote.amount > limit)


def _raise_purchase_order(quote, user):
    from apps.finance.models import ChartOfAccount
    from apps.procurement import services as procurement
    from apps.procurement.models import PurchaseOrder, PurchaseOrderLine

    job = quote.request
    prop = job.property or (job.lease.property if job.lease_id else None)
    from apps.finance.services.accounting import system_account_code
    expense = system_account_code('OWNER_FUNDS' if prop and prop.is_managed and not job.billed_to_tenant
                                  else 'MAINTENANCE')
    order = PurchaseOrder.objects.create(supplier=quote.supplier, order_date=timezone.localdate(),
                                         currency=job.currency, property_ref=prop, created_by=user,
                                         notes=f'Maintenance {job.reference}: {job.category}')
    PurchaseOrderLine.objects.create(order=order, description=f'{job.category}: {job.description[:200]}',
                                     expense_account=ChartOfAccount.objects.get(code=expense), quantity=1,
                                     unit_price=quote.amount)
    try:
        procurement.issue(order, user)     # stays draft if an approval rule applies
    except AccountingError:
        pass
    return order


@transaction.atomic
def accept_quote(quote, user=None, owner_approved=False):
    from apps.rentals.models import MaintenanceRequest

    if quote.status in (MaintenanceQuote.Status.ACCEPTED, MaintenanceQuote.Status.REJECTED):
        raise AccountingError(f'This quote is already {quote.get_status_display().lower()}.')
    job = quote.request
    if job.status in (MaintenanceRequest.Status.COMPLETED, MaintenanceRequest.Status.CLOSED,
                      MaintenanceRequest.Status.CANCELLED):
        raise AccountingError('The job is already closed.')
    if needs_owner_approval(quote) and not owner_approved:
        quote.status = MaintenanceQuote.Status.AWAITING_OWNER
        quote.save(update_fields=['status', 'updated_at'])
        prop = job.property or job.lease.property
        from apps.notifications.services import notify_contact
        notify_contact(prop.owner, f'Approval needed: {job.category} at {prop.name}',
                       f'A quote of {quote.amount:,.2f} from {quote.supplier.name} for "{job.description[:200]}" '
                       f'needs your approval. Please approve or decline it in the owner portal.',
                       category='owner_approval', related=f'maintenance:{job.reference}', user=user)
        return quote
    quote.status, quote.decided_by, quote.decided_at = MaintenanceQuote.Status.ACCEPTED, user, timezone.now()
    quote.purchase_order = _raise_purchase_order(quote, user)
    quote.save()
    job.quotes.exclude(pk=quote.pk).exclude(status=MaintenanceQuote.Status.REJECTED) \
        .update(status=MaintenanceQuote.Status.REJECTED)
    job.contractor = quote.supplier
    job.assigned_contractor = quote.supplier.name
    job.estimated_cost = quote.amount
    if job.status == MaintenanceRequest.Status.LOGGED:
        job.status = MaintenanceRequest.Status.ACKNOWLEDGED
    job.save()
    return quote


@transaction.atomic
def reject_quote(quote, user=None, note=''):
    if quote.status == MaintenanceQuote.Status.ACCEPTED:
        raise AccountingError('An accepted quote cannot be rejected; cancel its purchase order instead.')
    quote.status, quote.decided_by, quote.decided_at = MaintenanceQuote.Status.REJECTED, user, timezone.now()
    quote.owner_decision_note = note or quote.owner_decision_note
    quote.save()
    return quote


def owner_decision(quote, owner, approve, note=''):
    """Called from the owner portal; `owner` must own the job's property."""
    job = quote.request
    prop = job.property or (job.lease.property if job.lease_id else None)
    from apps.rentals.owners import owner_shares
    if not prop or prop.pk not in owner_shares(owner):
        raise AccountingError('This quote is not for one of your properties.')
    if quote.status != MaintenanceQuote.Status.AWAITING_OWNER:
        raise AccountingError('This quote is not waiting for your approval.')
    quote.owner_decision_note = note
    if approve:
        return accept_quote(quote, user=None, owner_approved=True)
    return reject_quote(quote, note=note)


@transaction.atomic
def raise_planned_jobs(today=None) -> str:
    from apps.rentals.models import MaintenanceRequest

    today = today or timezone.localdate()
    raised = 0
    for plan in MaintenancePlan.objects.filter(is_active=True).select_related('property', 'contractor'):
        while plan.next_due - relativedelta(days=plan.lead_days) <= today:
            job = MaintenanceRequest.objects.create(
                property=plan.property, category=plan.category, priority=plan.priority,
                description=f'Planned: {plan.title}. {plan.description}'.strip(),
                contractor=plan.contractor, assigned_contractor=plan.contractor.name if plan.contractor_id else '',
                estimated_cost=plan.estimated_cost,
                scheduled_date=timezone.make_aware(timezone.datetime.combine(plan.next_due, timezone.datetime.min.time())))
            plan.last_raised = job
            plan.next_due = plan.next_due + relativedelta(months=plan.frequency_months)
            raised += 1
        plan.save(update_fields=['next_due', 'last_raised', 'updated_at'])
    return f'{raised} planned job(s) raised'
