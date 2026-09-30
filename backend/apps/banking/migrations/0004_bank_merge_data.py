"""Data half of the bank account merge; see 0003 for the whole story."""

from decimal import Decimal

from django.db import migrations


def merge_accounts(apps, schema_editor):
    BankAccount = apps.get_model('finance', 'BankAccount')
    Corporate = apps.get_model('banking', 'CorporateBankAccount')
    Statement = apps.get_model('banking', 'CorporateBankStatement')
    Line = apps.get_model('banking', 'CorporateBankStatementLine')
    BankTransaction = apps.get_model('finance', 'BankTransaction')
    BankReconciliation = apps.get_model('finance', 'BankReconciliation')
    JournalLine = apps.get_model('finance', 'JournalLine')

    for corp in Corporate.objects.all():
        account = BankAccount.objects.filter(gl_account_id=corp.gl_account_id).first()
        if account is None:
            account = BankAccount.objects.create(
                code=corp.code, name=corp.code, bank_name=corp.bank_name, account_number=corp.account_number,
                branch_code=corp.branch_code or '', iban=corp.iban or '', swift_bic=corp.swift_bic or '',
                currency_id=corp.currency.code, account_type=corp.account_type, gl_account_id=corp.gl_account_id,
                opening_balance=corp.opening_balance, is_active=corp.is_active,
            )
        else:
            changed = []
            for field, value in (('code', corp.code), ('iban', corp.iban or ''), ('branch_code', corp.branch_code)):
                if value and not getattr(account, field):
                    if field == 'code' and BankAccount.objects.filter(code=value).exists():
                        continue
                    setattr(account, field, value)
                    changed.append(field)
            if changed:
                account.save(update_fields=changed)
        Statement.objects.filter(bank_account_old=corp).update(account=account)

    for account in BankAccount.objects.all():
        txns = list(BankTransaction.objects.filter(bank_account=account).order_by('date'))
        if not txns:
            continue
        total = sum((t.amount for t in txns), Decimal('0'))
        statement = Statement.objects.create(
            account=account, reference='Legacy imported transactions', statement_date=txns[-1].date,
            opening_balance=Decimal('0'), closing_balance=total, status='draft')
        used = set(Line.objects.filter(journal_entry_line__isnull=False).values_list('journal_entry_line_id', flat=True))
        for txn in txns:
            ledger_line = None
            recon = BankReconciliation.objects.filter(statement_transaction=txn).first()
            if recon is not None:
                ledger_line = JournalLine.objects.filter(entry_id=recon.journal_entry_id,
                                                         account_id=account.gl_account_id) \
                    .exclude(id__in=used).first()
                if ledger_line:
                    used.add(ledger_line.id)
            Line.objects.create(statement=statement, transaction_date=txn.date, reference=txn.reference or '',
                                description=txn.description, amount=txn.amount,
                                is_reconciled=bool(ledger_line) or txn.is_reconciled,
                                journal_entry_line=ledger_line)

    # One ledger line, one statement line.
    seen = set()
    for line in Line.objects.filter(journal_entry_line__isnull=False).order_by('id'):
        if line.journal_entry_line_id in seen:
            line.journal_entry_line = None
            line.is_reconciled = False
            line.save(update_fields=['journal_entry_line', 'is_reconciled'])
        seen.add(line.journal_entry_line_id)


class Migration(migrations.Migration):

    dependencies = [
        ('banking', '0003_statements_use_finance_bank_account'),
    ]

    operations = [
        migrations.RunPython(merge_accounts, migrations.RunPython.noop),
    ]
