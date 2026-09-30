from decimal import Decimal

from django.db import models
from django.db.models import Q, Sum

from apps.core.models import AuditedModel


class BankAccount(AuditedModel):
    """
    The one bank / cash account model. Linked 1-to-1 to its GL account.

    Receipts, payments, refunds and payouts post to it; the banking app
    imports its statements and reconciles them against its GL lines. (There
    used to be a second, parallel `banking.CorporateBankAccount` plus
    finance-side statement tables; they were merged into this and the
    banking statements in migration banking.0003.)
    """
    class AccountType(models.TextChoices):
        CURRENT = 'current', 'Current / Cheque'
        SAVINGS = 'savings', 'Savings'
        CREDIT = 'credit', 'Credit Card'
        LOAN = 'loan', 'Loan Account'
        INVESTMENT = 'investment', 'Investment'
        PETTY_CASH = 'petty_cash', 'Petty Cash'

    code = models.CharField(max_length=20, unique=True, null=True, blank=True,
                            help_text='Internal identifier, e.g. FNB-OPER-01')
    name = models.CharField(max_length=100)
    bank_name = models.CharField(max_length=100)
    account_number = models.CharField(max_length=50)
    branch_code = models.CharField(max_length=20, blank=True)
    iban = models.CharField(max_length=50, blank=True)
    swift_bic = models.CharField(max_length=20, blank=True)
    currency = models.ForeignKey('core.Currency', to_field='code', db_column='currency', on_delete=models.PROTECT, default='USD')

    account_type = models.CharField(max_length=20, choices=AccountType.choices, default=AccountType.CURRENT)
    gl_account = models.OneToOneField(
        'finance.ChartOfAccount', on_delete=models.PROTECT,
        related_name='bank_account_detail'
    )
    opening_balance = models.DecimalField(max_digits=20, decimal_places=2, default=Decimal('0.00'),
                                          help_text='Informational; the balance comes from the GL')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'finance_bank_accounts'
        ordering = ['code', 'name']

    def __str__(self):
        return f'{self.bank_name} - {self.name} (...{self.account_number[-4:] if len(self.account_number) > 4 else self.account_number})'

    def book_balance(self, as_of=None) -> Decimal:
        """Balance per the ledger (debits - credits on the bank GL account)."""
        from apps.finance.models import JournalEntry, JournalLine

        lines = JournalLine.objects.filter(account_id=self.gl_account_id,
                                           entry__status__in=JournalEntry.LEDGER_STATUSES)
        if as_of:
            lines = lines.filter(entry__entry_date__lte=as_of)
        agg = lines.aggregate(dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
        return (agg['dr'] or Decimal('0')) - (agg['cr'] or Decimal('0'))
