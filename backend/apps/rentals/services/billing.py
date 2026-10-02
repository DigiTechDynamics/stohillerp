"""
Recurring rental billing.

Generates the monthly invoices a lease owes up to a date, applies the lease's
annual escalation on each anniversary, and posts every invoice to AR/GL.
Idempotent: a period that already has an invoice is skipped, so the job can
run daily (`manage.py generate_rental_invoices`) or be re-run safely.
"""

import logging
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from dateutil.relativedelta import relativedelta
from django.conf import settings
from django.db import transaction

from apps.rentals.models import Lease, RentalInvoice
from apps.rentals.services.finance_sync import RentalFinanceSyncService

logger = logging.getLogger('stohill.rentals.billing')

CENT = Decimal('0.01')


@dataclass
class BillingResult:
    created: list = field(default_factory=list)   # invoice numbers
    invoices: list = field(default_factory=list)  # the invoice objects, for distribution
    escalated: list = field(default_factory=list)  # lease numbers
    errors: list = field(default_factory=list)     # (lease number, message)


def apply_escalation(lease: Lease, period_start: date) -> bool:
    """Escalate the rent once per lease anniversary reached by period_start."""
    rate = lease.rental_escalation_rate or Decimal('0')
    years = relativedelta(period_start, lease.start_date).years
    if rate <= 0 or years < 1:
        return False
    anniversary = lease.start_date + relativedelta(years=years)
    if lease.last_escalation_date and lease.last_escalation_date >= anniversary:
        return False
    lease.monthly_rental = (lease.monthly_rental * (1 + rate / 100)).quantize(CENT)
    lease.last_escalation_date = anniversary
    return True


def _vat_rate() -> Decimal:
    return Decimal(str(settings.COMPANY_CONFIG.get('vat_rate', 0)))


def proration_factor(period_start: date, period_end: date) -> Decimal:
    """Share of a monthly period actually occupied (1 for a full period)."""
    full_end = period_start + relativedelta(months=1) - timedelta(days=1)
    if period_end >= full_end:
        return Decimal('1')
    return Decimal((period_end - period_start).days + 1) / Decimal((full_end - period_start).days + 1)


def charge_lines(lease: Lease, period_start: date, factor: Decimal) -> list:
    """Recurring lease charges due for the period, prorated like the rent."""
    lines = []
    for charge in lease.charges.select_related('account'):
        if not charge.applies_to(period_start):
            continue
        amount = (charge.monthly_amount * factor).quantize(CENT)
        vat = (amount * _vat_rate()).quantize(CENT) if charge.vat_applicable else Decimal('0.00')
        lines.append({'description': charge.description, 'account_code': charge.account.code if charge.account else '4920',
                      'amount': str(amount), 'vat': str(vat)})
    return lines


def generate_invoices_for_lease(lease: Lease, as_of: date, result: BillingResult) -> None:
    next_date = lease.next_invoice_date or lease.start_date
    while next_date <= as_of and (lease.end_date is None or next_date <= lease.end_date):
        period_start = next_date
        period_end = period_start + relativedelta(months=1) - timedelta(days=1)
        if lease.end_date:
            period_end = min(period_end, lease.end_date)

        with transaction.atomic():
            if not RentalInvoice.objects.filter(lease=lease, period_start=period_start).exists():
                from apps.propman.services.lease_terms import (
                    apply_lease_escalation, mark_turnover_billed, turnover_charge_lines,
                )
                from apps.propman.services.recoveries import recovery_charge_lines
                from apps.propman.services.utilities import utility_charge_lines

                if apply_lease_escalation(lease, period_start):
                    result.escalated.append(lease.lease_number)
                # The final period is billed only for the days the lease runs.
                factor = proration_factor(period_start, period_end)
                rent = (lease.monthly_rental * factor).quantize(CENT)
                vat = (rent * _vat_rate()).quantize(CENT) if lease.vat_applicable else Decimal('0.00')
                utility_lines, readings = utility_charge_lines(lease, period_start, period_end, _vat_rate())
                turnover_lines, turnover_reports = turnover_charge_lines(lease, period_start)
                charges = (charge_lines(lease, period_start, factor) + utility_lines
                           + recovery_charge_lines(lease, period_start, factor, _vat_rate()) + turnover_lines)
                other = sum((Decimal(c['amount']) + Decimal(c['vat']) for c in charges), Decimal('0.00'))
                invoice = RentalInvoice.objects.create(
                    lease=lease,
                    currency=lease.currency,
                    period_start=period_start,
                    period_end=period_end,
                    due_date=period_start + timedelta(days=lease.payment_due_days),
                    status=RentalInvoice.InvoiceStatus.DRAFT,
                    rental_amount=rent,
                    vat_amount=vat,
                    charges=charges,
                    other_charges=other,
                    total_amount=rent + vat + other,
                    balance_due=rent + vat + other,
                )
                # Post explicitly so a failure rolls this period back and is
                # reported (RentalInvoice.save() only logs sync errors).
                RentalFinanceSyncService.sync_rental_invoice_to_ar(invoice)
                RentalInvoice.objects.filter(pk=invoice.pk).update(status=RentalInvoice.InvoiceStatus.SENT)
                for reading in readings:
                    reading.billed_invoice = invoice
                    reading.save(update_fields=['billed_invoice'])
                mark_turnover_billed(turnover_reports, invoice)
                result.created.append(invoice.invoice_number)
                result.invoices.append(invoice)
                lease.last_invoiced_date = period_start

            next_date = period_start + relativedelta(months=1)
            lease.next_invoice_date = next_date
            Lease.objects.filter(pk=lease.pk).update(
                next_invoice_date=lease.next_invoice_date,
                last_invoiced_date=lease.last_invoiced_date,
                monthly_rental=lease.monthly_rental,
                last_escalation_date=lease.last_escalation_date,
            )


def generate_due_invoices(as_of: date, leases=None) -> BillingResult:
    """Bill every active lease up to as_of. One failing lease does not stop the rest."""
    result = BillingResult()
    qs = leases if leases is not None else Lease.objects.filter(status=Lease.LeaseStatus.ACTIVE)
    for lease in qs.select_related('tenant', 'property', 'currency'):
        if lease.tenant is None:
            result.errors.append((lease.lease_number, 'Lease has no tenant.'))
            continue
        try:
            generate_invoices_for_lease(lease, as_of, result)
        except Exception as e:  # reported to the caller, not swallowed
            logger.exception('Billing failed for lease %s', lease.lease_number)
            result.errors.append((lease.lease_number, str(e)))
    return result
