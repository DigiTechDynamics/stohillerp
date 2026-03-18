import uuid
from decimal import Decimal
from django.db import models
from apps.core.models import AuditedModel

class TaxCode(AuditedModel):
    """
    VAT/Tax configuration codes.
    Examples: STD (Standard 15%), ZERO (0%), EXEMPT.
    """
    code = models.CharField(max_length=10, unique=True)
    name = models.CharField(max_length=50)
    rate = models.DecimalField(max_digits=5, decimal_places=2, help_text="Percentage (e.g., 15.00)")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    
    # Liability account for collected tax, or asset account for input tax
    collected_account = models.ForeignKey(
        'finance.ChartOfAccount', on_delete=models.RESTRICT, related_name='tax_codes_collected',
        null=True, blank=True
    )
    paid_account = models.ForeignKey(
        'finance.ChartOfAccount', on_delete=models.RESTRICT, related_name='tax_codes_paid',
        null=True, blank=True
    )

    class Meta:
        db_table = 'finance_tax_codes'

    def __str__(self):
        return f'{self.code} - {self.rate}%'


class TaxTransaction(AuditedModel):
    """
    Tracks accumulated tax for easy reporting (VAT Returns).
    """
    class TransactionType(models.TextChoices):
        INPUT = 'input', 'Input Tax (Purchases)'
        OUTPUT = 'output', 'Output Tax (Sales)'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tax_code = models.ForeignKey(TaxCode, on_delete=models.PROTECT, related_name='transactions')
    transaction_type = models.CharField(max_length=10, choices=TransactionType.choices)
    
    date = models.DateField(db_index=True)
    gross_amount = models.DecimalField(max_digits=15, decimal_places=2)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2)
    net_amount = models.DecimalField(max_digits=15, decimal_places=2)
    
    # Traceability to the GL
    journal_entry = models.ForeignKey('finance.JournalEntry', on_delete=models.CASCADE, related_name='tax_transactions')
    reference = models.CharField(max_length=100)

    class Meta:
        db_table = 'finance_tax_transactions'
        indexes = [models.Index(fields=['transaction_type', 'date'])]

    def __str__(self):
        return f'{self.tax_code.code} | {self.transaction_type} | {self.tax_amount}'
