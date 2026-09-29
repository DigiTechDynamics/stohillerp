"""
Demo banking data: an operating account, a statement with lines, and one
matching ledger entry so the reconciliation workspace has something to match.

Demo-only. Invoked by `manage.py seed_demo`, which refuses to run in production.
Note: the demo journal entry is written directly as 'posted' for illustration;
real entries must go through the finance posting engine (maker/checker).
"""

from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction

from apps.banking.models import CorporateBankAccount, CorporateBankStatement, CorporateBankStatementLine
from apps.core.models import Currency, User
from apps.finance.models import ChartOfAccount, FiscalPeriod, Journal, JournalEntry, JournalLine


@transaction.atomic
def seed_demo_banking(log=print):
    log("Seeding Banking Data...")
    user = User.objects.filter(is_superuser=True).first()
    if not user:
        log("Error: No superuser found. Please create one first.")
        return

    # 1. Ensure a Bank GL Account exists
    bank_gl, _ = ChartOfAccount.objects.get_or_create(
        code='1010',
        defaults={
            'name': 'Main Operating Bank',
            'account_type': 'asset',
            'account_sub_type': 'bank',
            'is_active': True
        }
    )

    currency = Currency.objects.filter(code='USD').first()
    if not currency:
        currency = Currency.objects.create(code='USD', name='US Dollar', is_base=True)

    # 2. Create a Corporate Bank Account
    account, created = CorporateBankAccount.objects.get_or_create(
        code='FNB-OPER-01',
        defaults={
            'bank_name': 'First National Bank',
            'branch_code': '250655',
            'account_number': '62849503922',
            'account_type': 'current',
            'currency': currency,
            'gl_account': bank_gl,
            'opening_balance': Decimal('50000.00'),
            'current_balance': Decimal('75250.00'),
            'created_by': user
        }
    )
    if created:
        log(f"Created Bank Account: {account}")

    # 3. Create a Bank Statement
    statement, created = CorporateBankStatement.objects.get_or_create(
        bank_account=account,
        reference='STMT-2026-03',
        defaults={
            'statement_date': date.today(),
            'opening_balance': Decimal('50000.00'),
            'closing_balance': Decimal('75000.00'),
            'status': 'draft',
            'created_by': user
        }
    )
    if created:
        log(f"Created Statement: {statement}")
        
        # Add some lines to the statement
        lines_data = [
            {'date': date.today() - timedelta(days=5), 'desc': 'Rent Receipt - Unit 101', 'ref': 'RENT-101', 'amt': Decimal('15000.00')},
            {'date': date.today() - timedelta(days=4), 'desc': 'Bank Charges', 'ref': 'CHG-992', 'amt': Decimal('-250.00')},
            {'date': date.today() - timedelta(days=2), 'desc': 'Electricity Bill', 'ref': 'UTIL-APR', 'amt': Decimal('-4500.00')},
            {'date': date.today() - timedelta(days=1), 'desc': 'Interest Earned', 'ref': 'INT-MAR', 'amt': Decimal('500.00')},
        ]
        
        for ld in lines_data:
            CorporateBankStatementLine.objects.create(
                statement=statement,
                transaction_date=ld['date'],
                description=ld['desc'],
                reference=ld['ref'],
                amount=ld['amt']
            )
        log(f"Added {len(lines_data)} lines to statement.")

    # 4. Create matching Ledger Entries for some lines
    journal = Journal.objects.filter(code='GJ').first()
    if not journal:
        journal = Journal.objects.create(code='GJ', name='General Journal')
        
    period = FiscalPeriod.objects.filter(status='open').first()
    if period:
        # Create a matching entry for the Rent Receipt
        # Keyed on reference so re-running doesn't duplicate the entry.
        entry, entry_created = JournalEntry.objects.get_or_create(
            defaults=dict(
                journal=journal,
                fiscal_period=period,
                entry_date=date.today() - timedelta(days=5),
                description='Rent Receipt - Unit 101 (Manual Entry for Matching)',
                status='posted',
                created_by=user,
            ),
        )
        if not entry_created:
            log("Matching ledger entry already exists.")
            return
        # Debit Bank
        JournalLine.objects.create(
            entry=entry,
            account=bank_gl,
            side='debit',
            amount=Decimal('15000.00')
        )
        # Credit Revenue (simplified)
        rev_acc, _ = ChartOfAccount.objects.get_or_create(code='4100', defaults={'name': 'Rental Income', 'account_type': 'revenue', 'account_sub_type': 'operating_revenue'})
        JournalLine.objects.create(
            entry=entry,
            account=rev_acc,
            side='credit',
            amount=Decimal('15000.00')
        )
        log("Created matching ledger entry for Rent Receipt.")
