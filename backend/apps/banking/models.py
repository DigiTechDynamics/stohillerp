"""
Bank statements and reconciliation.

Statements belong to the single bank account model, finance.BankAccount.
Each statement line is matched to at most one journal line on that account's
GL account (the unique constraint stops a ledger line being matched twice).
"""

from decimal import Decimal

from django.db import models
from django.db.models import Q

from apps.core.models import AuditedModel


class CorporateBankStatement(AuditedModel):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('reconciling', 'Reconciling'),
        ('reconciled', 'Reconciled'),
    ]

    bank_account = models.ForeignKey('finance.BankAccount', on_delete=models.PROTECT, related_name='statements')
    reference = models.CharField(max_length=100)
    statement_date = models.DateField()
    opening_balance = models.DecimalField(max_digits=20, decimal_places=2)
    closing_balance = models.DecimalField(max_digits=20, decimal_places=2)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    document = models.ForeignKey('documents.Document', on_delete=models.SET_NULL, null=True, blank=True)

    class Meta:
        ordering = ['-statement_date', '-created_at']

    def __str__(self):
        return f"Statement {self.reference} ({self.statement_date})"

    def refresh_status(self):
        lines = self.lines.all()
        if lines and all(line.is_reconciled for line in lines):
            status = 'reconciled'
        elif any(line.is_reconciled for line in lines):
            status = 'reconciling'
        else:
            status = 'draft'
        if status != self.status:
            self.status = status
            self.save(update_fields=['status'])


class CorporateBankStatementLine(models.Model):
    statement = models.ForeignKey(CorporateBankStatement, on_delete=models.CASCADE, related_name='lines')
    transaction_date = models.DateField()
    value_date = models.DateField(null=True, blank=True)
    reference = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True)
    # Positive = money in (deposit), negative = money out.
    amount = models.DecimalField(max_digits=20, decimal_places=2)

    # Financial reconciliation
    is_reconciled = models.BooleanField(default=False)
    journal_entry_line = models.ForeignKey('finance.JournalLine', on_delete=models.SET_NULL, null=True, blank=True,
                                           related_name='bank_statement_lines')

    class Meta:
        ordering = ['transaction_date', 'id']
        constraints = [
            models.UniqueConstraint(fields=['journal_entry_line'], condition=Q(journal_entry_line__isnull=False),
                                    name='bank_line_matches_one_ledger_line'),
        ]

    def __str__(self):
        return f"{self.transaction_date} - {self.reference} ({self.amount})"


class ReconciliationRule(AuditedModel):
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

    # Keyword/regex rules can post the line straight to this account
    # (bank charges, interest) when auto_post is on.
    auto_post = models.BooleanField(default=False)
    target_account = models.ForeignKey('finance.ChartOfAccount', on_delete=models.SET_NULL, null=True, blank=True)

    is_active = models.BooleanField(default=True)
    priority = models.PositiveIntegerField(default=10)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['priority', 'name']
