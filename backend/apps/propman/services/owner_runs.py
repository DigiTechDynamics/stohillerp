"""Pay many owners at once and produce the bank upload file."""

import csv
import io
from decimal import Decimal

from django.db import transaction

from apps.core.services.number_sequence import NumberSequenceService
from apps.finance.services.accounting import AccountingError
from apps.propman.models import OwnerPaymentRun
from apps.rentals.owners import available_to_pay, owners_queryset, pay_owner

ZERO = Decimal('0.00')


def payment_run_preview(owner_ids=None, minimum=ZERO):
    rows = []
    for owner in owners_queryset():
        if owner_ids and str(owner.pk) not in {str(i) for i in owner_ids}:
            continue
        amount = available_to_pay(owner)
        if amount > 0 and amount >= Decimal(minimum or 0):
            rows.append({'owner': str(owner.pk), 'name': owner.full_name, 'amount': str(amount),
                         'has_bank_details': bool(owner.bank_account_number)})
    return rows


@transaction.atomic
def run_owner_payments(run_date, bank_account, owner_ids=None, minimum=ZERO, user=None) -> OwnerPaymentRun:
    """Pay each selected owner their full available balance (rent collected, less what is owed to tenants)."""
    preview = payment_run_preview(owner_ids, minimum)
    if not preview:
        raise AccountingError('No owner has a collected balance to pay.')
    owners = {str(o.pk): o for o in owners_queryset().filter(pk__in=[r['owner'] for r in preview])}
    lines, total = [], ZERO
    for row in preview:
        owner = owners[row['owner']]
        amount = Decimal(row['amount'])
        entry = pay_owner(owner, amount, bank_account, run_date, user)
        total += amount
        lines.append({'owner': row['owner'], 'name': owner.full_name, 'amount': str(amount),
                      'journal_entry': entry.reference, 'bank_name': owner.bank_name,
                      'branch_code': owner.bank_branch_code, 'account_number': owner.bank_account_number,
                      'account_name': owner.bank_account_name or owner.full_name})
    return OwnerPaymentRun.objects.create(
        number=NumberSequenceService.get_next_number('Owner Payment Run', prefix='OPR-', padding=4),
        run_date=run_date, bank_account=bank_account, total=total, lines=lines, created_by=user)


def bank_file(run: OwnerPaymentRun) -> str:
    """Generic CSV for bank bulk-payment upload (map columns to your bank's template if needed)."""
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(['beneficiary_name', 'bank_name', 'branch_code', 'account_number', 'amount', 'reference'])
    for line in run.lines:
        writer.writerow([line['account_name'], line['bank_name'], line['branch_code'], line['account_number'],
                         line['amount'], f'{run.number} {line["name"]}'[:30]])
    return out.getvalue()
