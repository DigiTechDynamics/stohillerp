"""
Debit-order collections and deposit interest.

A batch collects, for each active mandate whose collection day matches, the
lease's open balance (or the mandate's fixed amount). The bank file is a
generic CSV; when the bank returns results, paid items are receipted to the
oldest open invoices (RentalPayment, method debit order) and unpaid items are
logged on the arrears case and the tenant is notified.
"""

import csv
import io
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.services.number_sequence import NumberSequenceService
from apps.finance.services.accounting import AccountingError, AccountingService, PostingData
from apps.propman.models import DebitOrderBatch, DebitOrderItem, DebitOrderMandate, DepositInterest

ZERO = Decimal('0.00')
CENT = Decimal('0.01')


def _open_invoices(lease):
    from apps.rentals.models import RentalInvoice

    return RentalInvoice.objects.filter(lease=lease, balance_due__gt=0) \
        .exclude(status__in=[RentalInvoice.InvoiceStatus.DRAFT, RentalInvoice.InvoiceStatus.CANCELLED]) \
        .order_by('due_date', 'period_start')


@transaction.atomic
def create_batch(collection_date, bank_account, all_mandates=False, user=None) -> DebitOrderBatch:
    mandates = DebitOrderMandate.objects.filter(status=DebitOrderMandate.Status.ACTIVE)
    if not all_mandates:
        mandates = mandates.filter(collection_day=collection_date.day)
    batch = DebitOrderBatch.objects.create(
        number=NumberSequenceService.get_next_number('Debit Order Batch', prefix='DOB-', padding=4),
        collection_date=collection_date, bank_account=bank_account, created_by=user)
    total = ZERO
    for mandate in mandates.select_related('lease'):
        balance = _open_invoices(mandate.lease).aggregate(t=Sum('balance_due'))['t'] or ZERO
        amount = balance if mandate.collect_full_balance else min(mandate.fixed_amount or ZERO, balance)
        if amount > 0:
            DebitOrderItem.objects.create(batch=batch, mandate=mandate, amount=amount)
            total += amount
    if total == 0:
        raise AccountingError('No active mandates have anything to collect on that date.')
    batch.total = total
    batch.save(update_fields=['total'])
    return batch


def batch_file(batch) -> str:
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(['mandate_reference', 'account_holder', 'bank_name', 'branch_code', 'account_number',
                     'account_type', 'amount', 'action_date', 'statement_reference'])
    for item in batch.items.select_related('mandate__lease'):
        m = item.mandate
        writer.writerow([m.reference, m.account_holder, m.bank_name, m.branch_code, m.account_number, m.account_type,
                         item.amount, batch.collection_date.isoformat(), f'{m.lease.lease_number}'[:20]])
    return out.getvalue()


@transaction.atomic
def process_results(batch, results, user=None) -> dict:
    """results: [{"item": id, "status": "paid"|"unpaid", "reason"?}]; items not listed stay pending."""
    from apps.notifications.services import notify_contact
    from apps.propman.models import ArrearsAction, ArrearsCase
    from apps.rentals.models import RentalPayment

    if batch.status == DebitOrderBatch.Status.PROCESSED:
        raise AccountingError('This batch has already been processed.')
    by_id = {str(i.pk): i for i in batch.items.select_related('mandate__lease__tenant')}
    paid = unpaid = 0
    for row in results:
        item = by_id.get(str(row.get('item')))
        if item is None or item.status != DebitOrderItem.Status.PENDING:
            continue
        lease = item.mandate.lease
        if row.get('status') == 'paid':
            remaining = item.amount
            for invoice in _open_invoices(lease):
                if remaining <= 0:
                    break
                portion = min(remaining, invoice.balance_due)
                payment = RentalPayment.objects.create(
                    invoice=invoice, payment_date=batch.collection_date, amount=portion,
                    payment_method=RentalPayment.PaymentMethod.DEBIT_ORDER,
                    reference=f'{batch.number}/{item.mandate.reference}', created_by=user)
                invoice.refresh_from_db()
                item.payments.add(payment)
                remaining -= portion
            item.status = DebitOrderItem.Status.PAID
            paid += 1
        else:
            item.status, item.unpaid_reason = DebitOrderItem.Status.UNPAID, (row.get('reason') or '')[:100]
            case = ArrearsCase.objects.filter(lease=lease, status__in=['open', 'promise', 'legal']).first()
            if case:
                ArrearsAction.objects.create(case=case, action='note', amount_overdue=case.amount_overdue,
                                             created_by=user,
                                             description=f'Debit order {item.amount} unpaid: {item.unpaid_reason}')
            if lease.tenant_id:
                notify_contact(lease.tenant, 'Debit order unpaid',
                               f'Dear {lease.tenant.first_name},\n\nYour debit order of {item.amount:,.2f} for lease '
                               f'{lease.lease_number} was returned unpaid ({item.unpaid_reason or "no reason given"}). '
                               f'Please pay by EFT or contact us.\n\n{settings.COMPANY_CONFIG.get("name", "")}',
                               category='debit_order', related=f'lease:{lease.lease_number}', user=user)
            unpaid += 1
        item.save()
    if not batch.items.filter(status=DebitOrderItem.Status.PENDING).exists():
        batch.status = DebitOrderBatch.Status.PROCESSED
    elif batch.status == DebitOrderBatch.Status.DRAFT:
        batch.status = DebitOrderBatch.Status.SUBMITTED
    batch.save(update_fields=['status'])
    return {'paid': paid, 'unpaid': unpaid, 'status': batch.status}


@transaction.atomic
def credit_deposit_interest(month_end=None, user=None) -> str:
    """Monthly interest on deposits held in trust (DEPOSIT_INTEREST_RATE % a year; 0 = off)."""
    from apps.rentals.models import Lease

    rate = Decimal(str(getattr(settings, 'DEPOSIT_INTEREST_RATE', 0) or 0))
    if rate <= 0:
        return 'deposit interest off'
    month_end = month_end or (timezone.localdate().replace(day=1) - timezone.timedelta(days=1))
    month = month_end.replace(day=1)
    count = 0
    for lease in Lease.objects.filter(deposit_paid=True, deposit_amount__gt=0).select_related('tenant', 'property'):
        if DepositInterest.objects.filter(lease=lease, month=month).exists():
            continue
        amount = (lease.deposit_amount * rate / 100 / 12).quantize(CENT)
        if amount <= 0:
            continue
        service = AccountingService(user=user)
        posting = PostingData(description=f'Deposit interest {month:%B %Y} - {lease.lease_number}',
                              entry_date=month_end, source_module='deposit_interest', source_id=lease.pk,
                              source_reference=f'DEPINT-{lease.lease_number}-{month:%Y%m}')
        posting.add_debit(service.ACCOUNTS['BANK_TRUST'], amount, 'Interest earned on trust deposit',
                          property_ref=lease.property, contact_ref=lease.tenant)
        posting.add_credit(service.ACCOUNTS['TENANT_DEPOSITS'], amount, 'Interest credited to tenant deposit',
                           property_ref=lease.property, contact_ref=lease.tenant)
        entry = service.post_entry(posting, journal_code='RJ')
        DepositInterest.objects.create(lease=lease, month=month, rate=rate, amount=amount, journal_entry=entry)
        Lease.objects.filter(pk=lease.pk).update(deposit_amount=lease.deposit_amount + amount)
        count += 1
    return f'{count} deposit(s) credited'
