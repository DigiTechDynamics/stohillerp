"""
Demo banking data: the operating bank account, a statement with lines, and
a posted rent receipt in the ledger so the reconciliation workspace has
something to match.

Demo-only. Invoked by `manage.py seed_demo`, which refuses to run in production.
"""

from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.banking.models import CorporateBankStatement, CorporateBankStatementLine
from apps.core.models import User
from apps.finance.models import BankAccount, ChartOfAccount, JournalEntry
from apps.finance.services.accounting import AccountingError, AccountingService, PostingData


@transaction.atomic
def seed_demo_banking(log=print):
    log("Seeding Banking Data...")
    user = User.objects.filter(is_superuser=True).first()
    bank_gl = ChartOfAccount.objects.get(code='1010')

    account, created = BankAccount.objects.get_or_create(
        gl_account=bank_gl,
        defaults={
            'code': 'FNB-OPER-01', 'name': 'Main Operating', 'bank_name': 'First National Bank',
            'branch_code': '250655', 'account_number': '62849503922', 'account_type': 'current',
            'opening_balance': Decimal('50000.00'), 'created_by': user,
        },
    )
    if created:
        log(f"Created bank account {account}")

    today = timezone.localdate()
    receipt_date = today - timedelta(days=5)
    if not JournalEntry.objects.filter(source_reference='DEMO-RENT-101').exists():
        posting = PostingData(description='Rent receipt - Unit 101', entry_date=receipt_date,
                              source_module='demo', source_reference='DEMO-RENT-101')
        posting.add_debit('1010', Decimal('15000.00'), 'Rent received')
        posting.add_credit('4100', Decimal('15000.00'), 'Rental income')
        try:
            AccountingService(user=user).post_entry(posting)
            log("Posted demo rent receipt to the ledger.")
        except AccountingError as e:   # no open period for the demo date
            log(f"Skipped demo ledger entry: {e}")

    statement, created = CorporateBankStatement.objects.get_or_create(
        bank_account=account, reference=f'STMT-{today:%Y-%m}',
        defaults={'statement_date': today, 'opening_balance': Decimal('50000.00'),
                  'closing_balance': Decimal('64750.00'), 'status': 'draft', 'created_by': user},
    )
    if created:
        CorporateBankStatementLine.objects.bulk_create([
            CorporateBankStatementLine(statement=statement, transaction_date=receipt_date,
                                       description='Rent receipt - Unit 101', reference='DEMO-RENT-101',
                                       amount=Decimal('15000.00')),
            CorporateBankStatementLine(statement=statement, transaction_date=today - timedelta(days=2),
                                       description='Monthly service fee', reference='BANK-FEE',
                                       amount=Decimal('-250.00')),
        ])
        log("Created demo statement with 2 lines (one matches the ledger, one is a bank charge).")
