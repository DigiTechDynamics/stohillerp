import uuid
from django.db import models
from apps.core.models import AuditedModel

class BankAccount(AuditedModel):
    """
    Represents a real-world bank account or petty cash fund.
    Linked 1-to-1 to a GL Chart of Account.
    """
    class AccountType(models.TextChoices):
        CHEQUE = 'cheque', 'Cheque / Current'
        SAVINGS = 'savings', 'Savings'
        CREDIT = 'credit', 'Credit Card'
        PETTY_CASH = 'petty_cash', 'Petty Cash'

    name = models.CharField(max_length=100)
    bank_name = models.CharField(max_length=100)
    account_number = models.CharField(max_length=50)
    branch_code = models.CharField(max_length=20, blank=True)
    swift_bic = models.CharField(max_length=20, blank=True)
    currency = models.ForeignKey('core.Currency', to_field='code', db_column='currency', on_delete=models.PROTECT, default='USD')
    
    account_type = models.CharField(max_length=20, choices=AccountType.choices, default=AccountType.CHEQUE)
    gl_account = models.OneToOneField(
        'finance.ChartOfAccount', on_delete=models.PROTECT, 
        related_name='bank_account_detail'
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'finance_bank_accounts'

    def __str__(self):
        return f'{self.bank_name} - {self.name} (...{self.account_number[-4:] if len(self.account_number) > 4 else self.account_number})'


class BankTransaction(AuditedModel):
    """
    Individual lines from a bank statement (imported or manual).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bank_account = models.ForeignKey(BankAccount, on_delete=models.CASCADE, related_name='transactions')
    
    date = models.DateField(db_index=True)
    description = models.CharField(max_length=255)
    reference = models.CharField(max_length=100, blank=True)
    amount = models.DecimalField(max_digits=15, decimal_places=2, help_text="Positive for deposits, negative for withdrawals")
    
    is_reconciled = models.BooleanField(default=False)
    
    class Meta:
        db_table = 'finance_bank_transactions'
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f'{self.date} | {self.description} | {self.amount}'


class BankReconciliation(AuditedModel):
    """
    Matches a BankTransaction to a system JournalEntry line 
    (or multiple receipts/payments).
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    bank_account = models.ForeignKey(BankAccount, on_delete=models.CASCADE)
    statement_transaction = models.ForeignKey(BankTransaction, on_delete=models.CASCADE)
    journal_entry = models.ForeignKey('finance.JournalEntry', on_delete=models.CASCADE)
    
    matched_amount = models.DecimalField(max_digits=15, decimal_places=2)
    matched_at = models.DateTimeField(auto_now_add=True)
    matched_by = models.ForeignKey('core.User', on_delete=models.SET_NULL, null=True)

    class Meta:
        db_table = 'finance_bank_reconciliations'

    def __str__(self):
        return f'Recon: {self.statement_transaction.id} -> {self.journal_entry.reference}'
