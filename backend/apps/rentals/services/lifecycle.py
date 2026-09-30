"""
Lease renewals and terminations, and maintenance job completion.
"""

from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.finance.services.accounting import AccountingError
from apps.rentals.models import Lease, LeaseCharge, MaintenanceRequest, RentalInvoice
from apps.rentals.services.billing import proration_factor
from apps.rentals.services.finance_sync import RentalFinanceSyncService

CENT = Decimal('0.01')


@transaction.atomic
def renew_lease(lease: Lease, new_end_date: date, monthly_rental: Decimal = None,
                escalation_rate: Decimal = None) -> Lease:
    """
    Renew as a new lease record (the history of terms stays intact): it starts
    the day after the current end date with the same tenant, unit and
    charges; the old lease is marked RENEWED.
    """
    if lease.status not in (Lease.LeaseStatus.ACTIVE, Lease.LeaseStatus.EXPIRED):
        raise AccountingError('Only active or expired leases can be renewed.')
    if not lease.end_date:
        raise AccountingError('Month-to-month leases run on; set an end date first or edit the lease.')
    start = lease.end_date + timedelta(days=1)
    if new_end_date <= start:
        raise AccountingError('The renewal must end after it starts.')

    renewed = Lease.objects.create(
        property=lease.property, unit=lease.unit, tenant=lease.tenant, currency=lease.currency,
        lease_type=lease.lease_type, status=Lease.LeaseStatus.ACTIVE, start_date=start, end_date=new_end_date,
        notice_period_days=lease.notice_period_days,
        monthly_rental=monthly_rental if monthly_rental is not None else lease.monthly_rental,
        rental_escalation_rate=escalation_rate if escalation_rate is not None else lease.rental_escalation_rate,
        # The deposit carries over: still held, still owed back at the very end.
        deposit_amount=lease.deposit_amount, deposit_paid=lease.deposit_paid,
        deposit_paid_date=lease.deposit_paid_date, vat_applicable=lease.vat_applicable,
        invoice_day=lease.invoice_day, payment_due_days=lease.payment_due_days, next_invoice_date=start,
        managing_agent=lease.managing_agent, notes=f'Renewal of {lease.lease_number}',
    )
    for charge in lease.charges.filter(is_active=True):
        LeaseCharge.objects.create(lease=renewed, charge_type=charge.charge_type, description=charge.description,
                                   monthly_amount=charge.monthly_amount, account=charge.account,
                                   vat_applicable=charge.vat_applicable)
    lease.status = Lease.LeaseStatus.RENEWED
    lease.deposit_paid = False   # now held against the renewal
    lease.save(update_fields=['status', 'deposit_paid'])
    return renewed


@transaction.atomic
def terminate_lease(lease: Lease, termination_date: date, reason: str = '') -> dict:
    """
    End a lease early. Invoices for periods after the termination date are
    credited in full; the period containing it is credited for the unused
    days. Returns a summary including whether the notice period was honoured.
    """
    if lease.status != Lease.LeaseStatus.ACTIVE:
        raise AccountingError('Only active leases can be terminated.')
    if termination_date < lease.start_date:
        raise AccountingError('Termination cannot be before the lease starts.')

    today = timezone.localdate()
    notice_given = (termination_date - today).days
    credits = []
    for inv in lease.invoices.filter(period_end__gt=termination_date, is_posted_to_finance=True) \
            .exclude(status=RentalInvoice.InvoiceStatus.CANCELLED).order_by('period_start'):
        remaining = inv.total_amount - inv.credited_amount
        if inv.period_start > termination_date:
            credit = remaining
        else:
            used = proration_factor(inv.period_start, termination_date)
            credit = (remaining * (1 - used)).quantize(CENT)
        if credit > 0:
            note = RentalFinanceSyncService.credit_rental_invoice(
                inv, credit, f'Lease terminated {termination_date}', max(termination_date, inv.period_start))
            credits.append({'invoice': inv.invoice_number, 'credit_note': note.invoice_number,
                            'amount': str(credit)})

    lease.status = Lease.LeaseStatus.TERMINATED
    lease.end_date = termination_date
    lease.notes = (lease.notes + f'\nTerminated {termination_date}: {reason}').strip()
    lease.save(update_fields=['status', 'end_date', 'notes'])
    if lease.unit_id:
        lease.unit.status = 'available'
        lease.unit.save(update_fields=['status'])
    return {
        'lease': lease.lease_number, 'end_date': termination_date.isoformat(), 'credits': credits,
        'notice_days_given': notice_given,
        'short_notice': notice_given < lease.notice_period_days,
        'deposit_held': str(lease.deposit_amount) if lease.deposit_paid else '0.00',
    }


@transaction.atomic
def complete_maintenance(job: MaintenanceRequest, actual_cost: Decimal, contractor=None,
                         contractor_invoice_number: str = '', bill_to_tenant: bool = None, user=None) -> dict:
    """
    Close a maintenance job: raise the contractor's AP bill (draft, for the
    normal review/approval/posting flow) and, when billed to the tenant,
    post an AR recharge. On a managed property the cost is charged to the
    owner's trust balance instead of company expenses.
    """
    from apps.finance.models import (
        ChartOfAccount, CustomerInvoice, CustomerInvoiceLine, SupplierInvoice, SupplierInvoiceLine,
    )
    from apps.finance.services.accounting import AccountingService

    if job.status in (MaintenanceRequest.Status.COMPLETED, MaintenanceRequest.Status.CLOSED):
        raise AccountingError('This job is already completed.')
    contractor = contractor or job.contractor
    if contractor is None:
        raise AccountingError('Choose the contractor (supplier) who did the work.')
    actual_cost = Decimal(actual_cost)
    if actual_cost <= 0:
        raise AccountingError('Actual cost must be greater than zero.')
    bill_to_tenant = job.billed_to_tenant if bill_to_tenant is None else bill_to_tenant
    prop = job.property or (job.lease.property if job.lease_id else None)
    today = timezone.localdate()

    managed = prop is not None and prop.is_managed
    expense_code = '2210' if managed and not bill_to_tenant else '5300'
    bill = SupplierInvoice.objects.create(
        supplier=contractor, invoice_number=contractor_invoice_number or '', invoice_date=today,
        due_date=today + timedelta(days=contractor.payment_terms_days), currency=job.currency,
        reference=f'Maintenance {job.reference}', subtotal=actual_cost, total_amount=actual_cost,
    )
    SupplierInvoiceLine.objects.create(
        invoice=bill, description=f'{job.category}: {job.description[:200]}',
        expense_account=ChartOfAccount.objects.get(code=expense_code), unit_price=actual_cost,
        line_total=actual_cost, property_ref=prop)

    recharge = None
    if bill_to_tenant:
        if not (job.lease_id and job.lease.tenant_id):
            raise AccountingError('Only jobs linked to a lease with a tenant can be billed to the tenant.')
        customer = RentalFinanceSyncService.sync_tenant_to_customer(job.lease.tenant)
        recharge = CustomerInvoice.objects.create(
            customer=customer, invoice_date=today, due_date=today + timedelta(days=job.lease.payment_due_days),
            currency=job.currency, reference=f'Maintenance recharge {job.reference}',
            subtotal=actual_cost, total_amount=actual_cost)
        CustomerInvoiceLine.objects.create(
            invoice=recharge, description=f'Repair recharge: {job.category}',
            revenue_account=ChartOfAccount.objects.get(code='5300'), unit_price=actual_cost,
            line_total=actual_cost, property_ref=prop)
        # Credit the repairs expense: the tenant reimburses the company's cost.
        entry = AccountingService(user=user).post_customer_invoice(recharge)
        recharge.status, recharge.journal_entry = CustomerInvoice.InvoiceStatus.POSTED, entry
        recharge.save(update_fields=['status', 'journal_entry'])

    job.contractor = contractor
    job.actual_cost = actual_cost
    job.billed_to_tenant = bill_to_tenant
    job.status = MaintenanceRequest.Status.COMPLETED
    job.completed_date = timezone.now()
    job.supplier_invoice = bill
    job.recharge_invoice = recharge
    job.save()
    return {
        'status': job.status, 'supplier_invoice': bill.invoice_number,
        'charged_to': 'tenant' if bill_to_tenant else ('owner' if managed else 'company'),
        'recharge_invoice': recharge.invoice_number if recharge else None,
    }
