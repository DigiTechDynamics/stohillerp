"""
Recurring journals and automatic reversals (run daily by run_daily_jobs).

- Entries with auto_reverse_date <= today (month-end accruals, unrealised FX
  revaluations) are reversed on that date.
- Active recurring templates due on or before today generate their entries,
  catching up any missed runs, then move next_run_date forward.
"""

import logging
from datetime import date

from dateutil.relativedelta import relativedelta
from django.db import transaction

from apps.finance.models import JournalEntry, JournalLine, RecurringJournal
from apps.finance.services.accounting import AccountingError, AccountingService, PostingData

logger = logging.getLogger('stohill.finance.recurring')

STEP = {
    RecurringJournal.Frequency.MONTHLY: relativedelta(months=1),
    RecurringJournal.Frequency.QUARTERLY: relativedelta(months=3),
    RecurringJournal.Frequency.YEARLY: relativedelta(years=1),
}


def process_auto_reversals(today: date, user=None) -> list:
    reversed_refs = []
    due = JournalEntry.objects.filter(auto_reverse_date__lte=today, status=JournalEntry.EntryStatus.POSTED,
                                      is_reversal=False)
    for entry in due:
        with transaction.atomic():
            reversal = AccountingService(user=user).create_reversal(
                entry, entry_date=entry.auto_reverse_date, allow_locked_period=False)
            reversed_refs.append(reversal.reference)
    return reversed_refs


def generate_entry(template: RecurringJournal, run_date: date, user=None) -> JournalEntry:
    """One entry from a template, posted or left in draft per template.auto_post."""
    lines = list(template.lines.select_related('account'))
    if not lines:
        raise AccountingError(f'Recurring journal "{template.name}" has no lines.')
    service = AccountingService(user=user)
    description = f'{template.description} ({run_date:%b %Y})'
    reverse_on = (run_date + relativedelta(months=1)).replace(day=1) if template.reverse_next_period else None

    if template.auto_post:
        posting = PostingData(description=description, entry_date=run_date, source_module='recurring',
                              source_id=template.id, source_reference=template.name)
        for ln in lines:
            posting.add(ln.side, ln.account.code, ln.amount, ln.description or template.description,
                        cost_center=ln.cost_center, property_ref=ln.property_ref)
        entry = service.post_entry(posting, journal_code=template.journal.code)
        if reverse_on:
            entry.auto_reverse_date = reverse_on
            JournalEntry.objects.filter(pk=entry.pk).update(auto_reverse_date=reverse_on)
        return entry

    # Draft for review/approval: posted later through the normal entry workflow.
    entry = JournalEntry.objects.create(
        reference=service._generate_reference(template.journal.code), journal=template.journal,
        fiscal_period=service._get_fiscal_period(run_date), entry_date=run_date, description=description,
        source_module='recurring', source_id=template.id, source_reference=template.name,
        auto_reverse_date=reverse_on, status=JournalEntry.EntryStatus.DRAFT, created_by=user,
    )
    JournalLine.objects.bulk_create([
        JournalLine(entry=entry, account=ln.account, side=ln.side, amount=ln.amount, amount_currency=ln.amount,
                    description=ln.description or template.description, cost_center=ln.cost_center,
                    property_ref=ln.property_ref)
        for ln in lines
    ])
    return entry


def generate_due(today: date, user=None) -> list:
    created = []
    templates = RecurringJournal.objects.filter(is_active=True, next_run_date__lte=today).prefetch_related('lines')
    for template in templates:
        while template.next_run_date <= today and (template.end_date is None
                                                   or template.next_run_date <= template.end_date):
            with transaction.atomic():
                entry = generate_entry(template, template.next_run_date, user)
                template.last_run_date = template.next_run_date
                template.next_run_date = template.next_run_date + STEP[template.frequency]
                template.save(update_fields=['last_run_date', 'next_run_date'])
                created.append(entry.reference)
        if template.end_date and template.next_run_date > template.end_date:
            RecurringJournal.objects.filter(pk=template.pk).update(is_active=False)
    return created


def run_recurring_journals(today: date, user=None) -> str:
    reversed_refs = process_auto_reversals(today, user)
    created = generate_due(today, user)
    return f'{len(reversed_refs)} reversal(s), {len(created)} recurring entr{"y" if len(created) == 1 else "ies"}'
