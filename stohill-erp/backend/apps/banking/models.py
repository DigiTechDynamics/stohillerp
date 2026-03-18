from django.db import models
from apps.core.models import AuditedModel, TimeStampedModel
from decimal import Decimal

class CorporateBankAccount(AuditedModel, TimeStampedModel):
    ACCOUNT_TYPES = [
        ('current', 'Current/Checking'),
        ('savings', 'Savings'),
        ('credit', 'Credit Card'),
        ('loan', 'Loan Account'),
        ('investment', 'Investment'),
    ]

    code = models.CharField(max_length=20, unique=True, help_text="Internal identifier (e.g., FNB-OPER-01)")
    bank_name = models.CharField(max_length=100)
    branch_code = models.CharField(max_length=20)
    account_number = models.CharField(max_length=50)
    iban = models.CharField(max_length=50, blank=True, null=True)
    swift_bic = models.CharField(max_length=11, blank=True, null=True)
    account_type = models.CharField(max_length=20, choices=ACCOUNT_TYPES, default='current')
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT)
    gl_account = models.ForeignKey('finance.ChartOfAccount', on_delete=models.PROTECT, related_name='corporate_bank_accounts')
    
    opening_balance = models.DecimalField(max_digits=20, decimal_places=2, default=Decimal('0.00'))
    current_balance = models.DecimalField(max_digits=20, decimal_places=2, default=Decimal('0.00'))
    
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.bank_name} - {self.account_number} ({self.code})"

    class Meta:
        ordering = ['code']

class CorporateBankStatement(AuditedModel, TimeStampedModel):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('reconciling', 'Reconciling'),
        ('reconciled', 'Reconciled'),
    ]

    bank_account = models.ForeignKey(CorporateBankAccount, on_delete=models.CASCADE, related_name='statements')
    reference = models.CharField(max_length=100)
    statement_date = models.DateField()
    opening_balance = models.DecimalField(max_digits=20, decimal_places=2)
    closing_balance = models.DecimalField(max_digits=20, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    document = models.ForeignKey('documents.Document', on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"Statement {self.reference} - {self.bank_account.code} ({self.statement_date})"

class CorporateBankStatementLine(models.Model):
    statement = models.ForeignKey(CorporateBankStatement, on_delete=models.CASCADE, related_name='lines')
    transaction_date = models.DateField()
    value_date = models.DateField(null=True, blank=True)
    reference = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    amount = models.DecimalField(max_digits=20, decimal_places=2)
    
    # Financial reconciliation
    is_reconciled = models.BooleanField(default=False)
    journal_entry_line = models.ForeignKey('finance.JournalLine', on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"{self.transaction_date} - {self.reference} ({self.amount})"

class ReconciliationRule(AuditedModel, TimeStampedModel):
    RULE_TYPES = [
        ('exact_match', 'Exact Match (Reference + Amount)'),
        ('regex_match', 'Regular Expression Match'),
        ('keyword_match', 'Keyword Match'),
        ('date_amount_match', 'Date + Amount Match (within range)'),
    ]

    name = models.CharField(max_length=100)
    rule_type = models.CharField(max_length=50, choices=RULE_TYPES)
    
    # Matching criteria
    match_keyword = models.CharField(max_length=100, blank=True, null=True)
    match_regex = models.CharField(max_length=255, blank=True, null=True)
    amount_tolerance = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))
    date_tolerance_days = models.PositiveIntegerField(default=0)
    
    # Target for auto-posting if matched
    auto_post = models.BooleanField(default=False)
    target_account = models.ForeignKey('finance.ChartOfAccount', on_delete=models.SET_NULL, null=True, blank=True)
    
    is_active = models.BooleanField(default=True)
    priority = models.PositiveIntegerField(default=10)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['priority', 'name']
