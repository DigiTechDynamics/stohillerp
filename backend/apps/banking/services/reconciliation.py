"""
Bank statement import and reconciliation against the bank's GL account.

Sign convention: a statement line is positive for money in, negative for
money out. It matches a ledger line on the bank's GL account on the same
side (money in = debit to the bank account) for the same amount, and each
ledger line can be matched once.
"""

import csv
import io
import re
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.db.models import Q, Sum

from apps.banking.models import CorporateBankStatement, CorporateBankStatementLine, ReconciliationRule
from apps.finance.models import JournalEntry, JournalLine
from apps.finance.services.accounting import AccountingError, AccountingService, PostingData

ZERO = Decimal('0.00')


# ─── ledger side ─────────────────────────────────────────────────────────────

def signed(line: JournalLine) -> Decimal:
    """Ledger line as a bank movement: debit (money in) +, credit (money out) -."""
    return line.amount if line.side == 'debit' else -line.amount


def unmatched_ledger_lines(bank_account):
    return JournalLine.objects.filter(
        account_id=bank_account.gl_account_id, entry__status__in=JournalEntry.LEDGER_STATUSES,
        bank_statement_lines__isnull=True,
    ).select_related('entry').order_by('entry__entry_date', 'entry__reference')


def _candidates(bank_account, amount: Decimal):
    side = 'debit' if amount > 0 else 'credit'
    return unmatched_ledger_lines(bank_account).filter(side=side, amount=abs(amount))


# ─── import ──────────────────────────────────────────────────────────────────

def _parse_amount(value):
    value = (value or '').strip().replace(',', '').replace(' ', '')
    if value.startswith('(') and value.endswith(')'):
        value = '-' + value[1:-1]
    return Decimal(value) if value else ZERO


def _parse_date(value):
    value = (value or '').strip()
    for fmt_parse in (date.fromisoformat,
                      lambda v: date(int(v[6:10]), int(v[3:5]), int(v[0:2]))):   # DD/MM/YYYY
        try:
            return fmt_parse(value)
        except (ValueError, IndexError):
            continue
    raise ValueError(f'Unrecognised date {value!r} (use YYYY-MM-DD or DD/MM/YYYY)')


@transaction.atomic
def import_statement_csv(bank_account, file_obj, reference='', statement_date=None, opening_balance=None,
                         user=None) -> CorporateBankStatement:
    """
    CSV columns (header row, case-insensitive): date, description, reference,
    and either amount (signed) or debit/credit (money out / money in).
    Lines already imported for this account (same date, amount and
    reference) are skipped, so re-uploading an overlapping export is safe.
    """
    try:
        text = file_obj.read().decode('utf-8-sig')
    except UnicodeDecodeError:
        raise AccountingError('The statement must be a UTF-8 CSV file.')
    reader = csv.DictReader(io.StringIO(text))
    fields = {f.strip().lower(): f for f in (reader.fieldnames or [])}
    if 'date' not in fields or not ({'amount'} <= fields.keys() or {'debit', 'credit'} <= fields.keys()):
        raise AccountingError('CSV needs a date column and either amount, or debit and credit columns.')

    rows, errors = [], []
    for n, raw in enumerate(reader, start=2):
        row = {k.strip().lower(): (v or '').strip() for k, v in raw.items() if k}
        if not any(row.values()):
            continue
        try:
            when = _parse_date(row['date'])
            if 'amount' in row and row.get('amount'):
                amount = _parse_amount(row['amount'])
            else:
                amount = _parse_amount(row.get('credit')) - _parse_amount(row.get('debit'))
        except (ValueError, InvalidOperation) as e:
            errors.append(f'row {n}: {e}')
            continue
        rows.append((when, row.get('description', ''), row.get('reference', ''), amount))
    if errors:
        raise AccountingError('; '.join(errors[:20]))
    if not rows:
        raise AccountingError('The file has no transactions.')

    existing = set(CorporateBankStatementLine.objects.filter(statement__bank_account=bank_account)
                   .values_list('transaction_date', 'amount', 'reference'))
    new_rows = [r for r in rows if (r[0], r[3], r[2]) not in existing]
    if opening_balance is None:
        last = CorporateBankStatement.objects.filter(bank_account=bank_account).order_by('-statement_date').first()
        opening_balance = last.closing_balance if last else bank_account.opening_balance
    statement = CorporateBankStatement.objects.create(
        bank_account=bank_account, reference=reference or f'Import {max(r[0] for r in rows):%Y-%m-%d}',
        statement_date=statement_date or max(r[0] for r in rows), opening_balance=opening_balance,
        closing_balance=opening_balance + sum((r[3] for r in new_rows), ZERO), created_by=user)
    CorporateBankStatementLine.objects.bulk_create([
        CorporateBankStatementLine(statement=statement, transaction_date=d, description=desc, reference=ref,
                                   amount=amt) for d, desc, ref, amt in new_rows])
    statement.skipped_duplicates = len(rows) - len(new_rows)
    return statement


# ─── matching ────────────────────────────────────────────────────────────────

@transaction.atomic
def match(line: CorporateBankStatementLine, ledger_line: JournalLine) -> CorporateBankStatementLine:
    line = CorporateBankStatementLine.objects.select_for_update().select_related('statement__bank_account').get(pk=line.pk)
    account = line.statement.bank_account
    if line.is_reconciled:
        raise AccountingError('This statement line is already reconciled.')
    if ledger_line.account_id != account.gl_account_id:
        raise AccountingError('That ledger line is not on this bank account.')
    if ledger_line.entry.status not in JournalEntry.LEDGER_STATUSES:
        raise AccountingError('Only posted ledger lines can be matched.')
    if CorporateBankStatementLine.objects.filter(journal_entry_line=ledger_line).exists():
        raise AccountingError('That ledger line is already matched to another statement line.')
    if signed(ledger_line) != line.amount:
        raise AccountingError(f'Amounts differ: statement {line.amount}, ledger {signed(ledger_line)}.')
    line.journal_entry_line = ledger_line
    line.is_reconciled = True
    line.save(update_fields=['journal_entry_line', 'is_reconciled'])
    line.statement.refresh_status()
    return line


@transaction.atomic
def unmatch(line: CorporateBankStatementLine) -> CorporateBankStatementLine:
    line.journal_entry_line = None
    line.is_reconciled = False
    line.save(update_fields=['journal_entry_line', 'is_reconciled'])
    line.statement.refresh_status()
    return line


@transaction.atomic
def post_adjustment(line: CorporateBankStatementLine, account_code: str, user=None, description=''):
    """
    Book a statement-only item (bank charges, interest, a direct debit) and
    reconcile the line to it: money out debits `account_code`, money in
    credits it; the bank side matches the statement.
    """
    if line.is_reconciled:
        raise AccountingError('This statement line is already reconciled.')
    bank_code = line.statement.bank_account.gl_account.code
    posting = PostingData(description=description or f'Bank {"charge" if line.amount < 0 else "receipt"}: '
                                                      f'{line.description or line.reference}',
                          entry_date=line.transaction_date, source_module='banking', source_reference=line.reference)
    if line.amount < 0:
        posting.add_debit(account_code, -line.amount, line.description)
        posting.add_credit(bank_code, -line.amount, line.reference)
    else:
        posting.add_debit(bank_code, line.amount, line.reference)
        posting.add_credit(account_code, line.amount, line.description)
    entry = AccountingService(user=user).post_entry(posting)
    ledger_line = entry.lines.get(account__code=bank_code)
    return match(line, ledger_line), entry


def _rule_applies(rule, line):
    text = f'{line.description} {line.reference}'
    if rule.rule_type == 'keyword_match':
        return bool(rule.match_keyword) and rule.match_keyword.lower() in text.lower()
    if rule.rule_type == 'regex_match':
        try:
            return bool(rule.match_regex) and re.search(rule.match_regex, text, re.IGNORECASE) is not None
        except re.error:
            return False
    return True


def _find_ledger(rule, line):
    account = line.statement.bank_account
    candidates = _candidates(account, line.amount)
    if rule.rule_type == 'exact_match':
        return candidates.filter(Q(entry__reference__iexact=line.reference) |
                                 Q(entry__source_reference__iexact=line.reference)).first() if line.reference else None
    if rule.rule_type == 'date_amount_match':
        days = rule.date_tolerance_days or 3
        return candidates.filter(entry__entry_date__range=(line.transaction_date - timedelta(days=days),
                                                          line.transaction_date + timedelta(days=days))).first()
    # keyword / regex: amount on a nearby date
    return candidates.filter(entry__entry_date__range=(line.transaction_date - timedelta(days=7),
                                                      line.transaction_date + timedelta(days=7))).first()


def auto_match_statement(statement: CorporateBankStatement, user=None) -> dict:
    """
    Apply active rules in priority order to each open line: match an
    existing ledger line, or for keyword/regex rules with auto_post, book the
    line to the rule's target account. Falls back to reference + amount.
    """
    rules = list(ReconciliationRule.objects.filter(is_active=True).order_by('priority'))
    matched = posted = 0
    for line in statement.lines.filter(is_reconciled=False).select_related('statement__bank_account'):
        done = False
        for rule in rules:
            if not _rule_applies(rule, line):
                continue
            ledger_line = _find_ledger(rule, line)
            if ledger_line:
                match(line, ledger_line)
                matched += 1
                done = True
                break
            if rule.auto_post and rule.target_account_id and rule.rule_type in ('keyword_match', 'regex_match'):
                post_adjustment(line, rule.target_account.code, user, f'{rule.name}: {line.description}')
                posted += 1
                done = True
                break
        if not done and line.reference:
            ledger_line = _candidates(statement.bank_account, line.amount).filter(
                Q(entry__reference__iexact=line.reference) | Q(entry__source_reference__iexact=line.reference)).first()
            if ledger_line:
                match(line, ledger_line)
                matched += 1
    statement.refresh_status()
    return {'matches_found': matched, 'adjustments_posted': posted}


# ─── reporting ───────────────────────────────────────────────────────────────

def reconciliation_report(bank_account, as_of: date) -> dict:
    """
    Book-to-bank reconciliation at a date:
      balance per bank statement
      + deposits in the books not yet on the statement
      - payments in the books not yet on the statement
      = balance per books   (difference should be zero)
    plus statement lines not yet in the books.
    """
    statement = CorporateBankStatement.objects.filter(bank_account=bank_account, statement_date__lte=as_of) \
        .order_by('-statement_date', '-created_at').first()
    bank_balance = statement.closing_balance if statement else bank_account.opening_balance
    book_balance = bank_account.book_balance(as_of)
    outstanding = [
        {'date': ln.entry.entry_date.isoformat(), 'reference': ln.entry.reference,
         'description': ln.description or ln.entry.description, 'amount': str(signed(ln))}
        for ln in unmatched_ledger_lines(bank_account).filter(entry__entry_date__lte=as_of)
    ]
    deposits_in_transit = sum((Decimal(o['amount']) for o in outstanding if Decimal(o['amount']) > 0), ZERO)
    unpresented_payments = sum((Decimal(o['amount']) for o in outstanding if Decimal(o['amount']) < 0), ZERO)
    not_in_books = CorporateBankStatementLine.objects.filter(
        statement__bank_account=bank_account, is_reconciled=False, transaction_date__lte=as_of)
    not_in_books_total = not_in_books.aggregate(t=Sum('amount'))['t'] or ZERO
    adjusted_bank = bank_balance + deposits_in_transit + unpresented_payments - not_in_books_total
    return {
        'as_of': as_of.isoformat(),
        'statement': statement.reference if statement else None,
        'balance_per_bank': str(bank_balance),
        'deposits_in_transit': str(deposits_in_transit),
        'unpresented_payments': str(unpresented_payments),
        'statement_items_not_in_books': str(not_in_books_total),
        'adjusted_bank_balance': str(adjusted_bank),
        'balance_per_books': str(book_balance),
        'difference': str(adjusted_bank - book_balance),
        'outstanding_ledger_items': outstanding,
        'unrecorded_statement_items': [
            {'id': ln.id, 'date': ln.transaction_date.isoformat(), 'reference': ln.reference,
             'description': ln.description, 'amount': str(ln.amount)} for ln in not_in_books],
    }
