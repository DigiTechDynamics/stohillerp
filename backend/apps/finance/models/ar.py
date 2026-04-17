import uuid
from django.db import models  # type: ignore
from apps.core.models import AuditedModel  # type: ignore

class CustomerProfile(AuditedModel):
    """
    Links an existing CRM Contact/Organization to AR-specific data.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    
    # We allow linking directly to CRM Contact so we don't duplicate names/emails
    contact_link = models.OneToOneField(
        'crm.Contact', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='customer_profile'
    )
    
    # Fallback to direct name if CRM link not used
    name = models.CharField(max_length=200, help_text="Used if not linked to CRM")
    
    tax_number = models.CharField(max_length=50, blank=True)
    registration_number = models.CharField(max_length=50, blank=True)
    
    payment_terms_days = models.PositiveIntegerField(default=30)
    credit_limit = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    # Links to the AR control account in the GL
    ar_account = models.ForeignKey(
        'finance.ChartOfAccount', on_delete=models.RESTRICT,
        related_name='customers'
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'finance_ar_customer_profiles'
        ordering = ['name']

    def __str__(self):
        return self.contact_link.full_name if self.contact_link else self.name

    @property
    def balance(self):
        from decimal import Decimal
        from django.db.models import Sum, F, Q  # type: ignore
        from apps.finance.models import JournalLine, JournalEntry, CustomerInvoice  # type: ignore

        # The definitive balance should be the sum of all debits minus sum of all credits
        # in the AR control account for this specific customer/contact.
        
        ar_lines = JournalLine.objects.filter(
            contact_ref=self.contact_link,
            account=self.ar_account,
            entry__status=JournalEntry.EntryStatus.POSTED
        )
        
        dr_sum = ar_lines.filter(side='debit').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        cr_sum = ar_lines.filter(side='credit').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        return dr_sum - cr_sum


class CustomerInvoice(AuditedModel):
    """
    Header for a sales invoice to a customer.
    """
    class InvoiceStatus(models.TextChoices):  # type: ignore
        DRAFT = 'draft', 'Draft'
        UNPAID = 'posted', 'Unpaid'
        PARTIAL = 'partial', 'Partially Paid'
        PAID = 'paid', 'Paid'
        OVERDUE = 'overdue', 'Overdue'
        CANCELLED = 'cancelled', 'Cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(CustomerProfile, on_delete=models.PROTECT, related_name='invoices')
    
    invoice_number = models.CharField(max_length=100, unique=True, db_index=True)
    reference = models.CharField(max_length=100, blank=True)
    
    invoice_date = models.DateField(db_index=True)
    due_date = models.DateField(db_index=True)
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='customer_invoices', null=True, blank=True)
    
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    status = models.CharField(max_length=20, choices=InvoiceStatus.choices, default=InvoiceStatus.DRAFT)
    
    journal_entry = models.ForeignKey(
        'finance.JournalEntry', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='customer_invoices'
    )
    
    class Meta:
        db_table = 'finance_ar_invoices'

    def __str__(self):
        return f'{self.customer} - {self.invoice_number}'

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            from apps.core.services.number_sequence import NumberSequenceService  # type: ignore
            self.invoice_number = NumberSequenceService.get_next_number("Customer Invoice", prefix="SINV-", padding=5)
        super().save(*args, **kwargs)

    @property
    def balance_due(self):
        return self.total_amount - self.amount_paid


class CustomerInvoiceLine(AuditedModel):
    """
    Line items mapping to specific revenue accounts.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(CustomerInvoice, on_delete=models.CASCADE, related_name='lines')
    
    description = models.CharField(max_length=255)
    revenue_account = models.ForeignKey('finance.ChartOfAccount', on_delete=models.PROTECT)
    
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=15, decimal_places=2)
    
    tax_code = models.ForeignKey('finance.TaxCode', null=True, blank=True, on_delete=models.PROTECT)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=15, decimal_places=2)

    class Meta:
        db_table = 'finance_ar_invoice_lines'

    def __str__(self):
        return f'{self.invoice.invoice_number} | {self.description}'


class CustomerReceipt(AuditedModel):
    """
    Receipts (payments received) from a customer against invoices.
    """
    class ReceiptStatus(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        POSTED = 'posted', 'Posted'
        VOIDED = 'cancelled', 'Voided'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    customer = models.ForeignKey(CustomerProfile, on_delete=models.PROTECT, related_name='receipts')
    
    receipt_date = models.DateField(db_index=True)
    receipt_reference = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='customer_receipts', null=True, blank=True)
    
    bank_account = models.ForeignKey('finance.BankAccount', on_delete=models.PROTECT)
    
    status = models.CharField(max_length=20, choices=ReceiptStatus.choices, default=ReceiptStatus.DRAFT)
    
    journal_entry = models.ForeignKey(
        'finance.JournalEntry', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='customer_receipts'
    )

    class Meta:
        db_table = 'finance_ar_receipts'

    def __str__(self):
        return f'{self.customer} | {self.receipt_date} | {self.amount}'

    def save(self, *args, **kwargs):
        if not self.receipt_reference:
            from apps.core.services.number_sequence import NumberSequenceService  # type: ignore
            self.receipt_reference = NumberSequenceService.get_next_number("Customer Receipt", prefix="REC-", padding=5)
        super().save(*args, **kwargs)
