import csv
from io import StringIO
from decimal import Decimal
from datetime import datetime
from django.db import transaction
from django.core.exceptions import ValidationError

from apps.finance.models import BankAccount, BankTransaction, BankReconciliation, JournalEntry

class BankService:
    """Service to handle Bank Statement imports and Bank Reconciliation."""
    
    def __init__(self, user=None):
        self.user = user

    @transaction.atomic
    def import_bank_statement_csv(self, bank_account: BankAccount, file_obj) -> int:
        """
        Imports bank transactions from a simple CSV file.
        Expected headers: Date, Description, Reference, Amount
        Returns the number of imported transactions.
        """
        content = file_obj.read().decode('utf-8')
        reader = csv.DictReader(StringIO(content))
        
        imported_count = 0
        transactions = []
        
        for row in reader:
            try:
                date_obj = datetime.strptime(row['Date'], '%Y-%m-%d').date()
                amount_obj = Decimal(row['Amount'])
                
                # Check for duplicates (same date, amount, desc, ref)
                exists = BankTransaction.objects.filter(
                    bank_account=bank_account,
                    date=date_obj,
                    amount=amount_obj,
                    description=row['Description'],
                    reference=row.get('Reference', '')
                ).exists()
                
                if not exists:
                    transactions.append(BankTransaction(
                        bank_account=bank_account,
                        date=date_obj,
                        description=row['Description'],
                        reference=row.get('Reference', ''),
                        amount=amount_obj
                    ))
                    imported_count += 1
            except (ValueError, KeyError) as e:
                # Optionally log skipped rows
                pass
                
        if transactions:
            BankTransaction.objects.bulk_create(transactions)
            
        return imported_count

    @transaction.atomic
    def reconcile_transaction(self, statement_txn_id: str, journal_entry_id: str, amount: Decimal) -> BankReconciliation:
        """
        Matches a bank statement transaction to a journal entry line.
        """
        statement_txn = BankTransaction.objects.get(id=statement_txn_id)
        journal_entry = JournalEntry.objects.get(id=journal_entry_id)
        
        # Validation
        if statement_txn.bank_account.gl_account_id not in [line.account_id for line in journal_entry.lines.all()]:
            raise ValidationError("Journal Entry does not belong to this Bank Account's GL Account.")
            
        recon = BankReconciliation.objects.create(
            bank_account=statement_txn.bank_account,
            statement_transaction=statement_txn,
            journal_entry=journal_entry,
            matched_amount=amount,
            matched_by=self.user
        )
        
        # Check if fully reconciled
        total_reconciled = sum(r.matched_amount for r in statement_txn.bankreconciliation_set.all())
        if abs(total_reconciled) >= abs(statement_txn.amount):
            statement_txn.is_reconciled = True
            statement_txn.save()
            
        return recon
