import uuid
from django.db import models
from apps.core.models import AuditedModel

class Supplier(AuditedModel):
    """
    Supplier master data for Accounts Payable.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    tax_number = models.CharField(max_length=50, blank=True)
    registration_number = models.CharField(max_length=50, blank=True)
    
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=30, blank=True)
    address_line1 = models.CharField(max_length=255, blank=True)
    address_line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    
    currency = models.ForeignKey('core.Currency', on_delete=models.SET_NULL, null=True, blank=True, related_name='suppliers')
    payment_terms_days = models.PositiveIntegerField(default=30)
    
    # Links to the AP control account in the GL
    ap_account = models.ForeignKey(
        'finance.ChartOfAccount', on_delete=models.RESTRICT,
        related_name='suppliers'
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'finance_suppliers'
        ordering = ['name']

    def __str__(self):
        return self.name

    @property
    def balance(self):
        from decimal import Decimal
        from django.db.models import Sum
        from apps.finance.models import JournalLine, JournalEntry
        
        ap_lines = JournalLine.objects.filter(
            supplier_ref=self,
            account=self.ap_account,
            entry__status=JournalEntry.EntryStatus.POSTED
        )
        
        dr_sum = ap_lines.filter(side='debit').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        cr_sum = ap_lines.filter(side='credit').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
        
        # For AP, Credit increases balance, Debit decreases it.
        # Balance = Credits - Debits
        return cr_sum - dr_sum


class SupplierInvoice(AuditedModel):
    """
    Header for a purchase invoice.
    """
    class InvoiceStatus(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        REVIEWED = 'reviewed', 'Reviewed'
        POSTED = 'posted', 'Posted / Unpaid'
        PARTIAL = 'partial', 'Partially Paid'
        PAID = 'paid', 'Paid in Full'
        CANCELLED = 'cancelled', 'Cancelled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='invoices')
    
    invoice_number = models.CharField(max_length=100, db_index=True)
    reference = models.CharField(max_length=100, blank=True)
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='supplier_invoices', null=True, blank=True)
    
    invoice_date = models.DateField(db_index=True)
    due_date = models.DateField(db_index=True)
    
    subtotal = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    tax_total = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    amount_paid = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    status = models.CharField(max_length=20, choices=InvoiceStatus.choices, default=InvoiceStatus.DRAFT)
    
    # The journal entry created when this invoice is posted
    journal_entry = models.ForeignKey(
        'finance.JournalEntry', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='supplier_invoices'
    )
    
    class Meta:
        db_table = 'finance_supplier_invoices'
        unique_together = ['supplier', 'invoice_number']

    def __str__(self):
        return f'{self.supplier.name} - {self.invoice_number}'

    def save(self, *args, **kwargs):
        if not self.invoice_number:
            from apps.core.services.number_sequence import NumberSequenceService
            self.invoice_number = NumberSequenceService.get_next_number("Supplier Invoice", prefix="PINV-", padding=5)
        super().save(*args, **kwargs)

    @property
    def balance_due(self):
        return self.total_amount - self.amount_paid


class SupplierInvoiceLine(AuditedModel):
    """
    Line items mapping to specific expense or asset accounts.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(SupplierInvoice, on_delete=models.CASCADE, related_name='lines')
    
    description = models.CharField(max_length=255)
    expense_account = models.ForeignKey('finance.ChartOfAccount', on_delete=models.PROTECT)
    
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=1)
    unit_price = models.DecimalField(max_digits=15, decimal_places=2)
    
    tax_code = models.ForeignKey('finance.TaxCode', null=True, blank=True, on_delete=models.PROTECT)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    line_total = models.DecimalField(max_digits=15, decimal_places=2)

    class Meta:
        db_table = 'finance_supplier_invoice_lines'

    def __str__(self):
        return f'{self.invoice.invoice_number} | {self.description}'


class SupplierPayment(AuditedModel):
    """
    Payments made to a supplier against one or more invoices.
    """
    class PaymentStatus(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        POSTED = 'posted', 'Posted'
        VOIDED = 'cancelled', 'Voided'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name='payments')
    
    payment_date = models.DateField(db_index=True)
    payment_reference = models.CharField(max_length=100)
    amount = models.DecimalField(max_digits=15, decimal_places=2)
    currency = models.ForeignKey('core.Currency', on_delete=models.PROTECT, related_name='supplier_payments', null=True, blank=True)
    
    bank_account = models.ForeignKey('finance.BankAccount', on_delete=models.PROTECT)
    
    status = models.CharField(max_length=20, choices=PaymentStatus.choices, default=PaymentStatus.DRAFT)
    
    journal_entry = models.ForeignKey(
        'finance.JournalEntry', null=True, blank=True,
        on_delete=models.SET_NULL, related_name='supplier_payments'
    )

    class Meta:
        db_table = 'finance_supplier_payments'

    def __str__(self):
        return f'{self.supplier.name} | {self.payment_date} | {self.amount}'

    def save(self, *args, **kwargs):
        if not self.payment_reference:
            from apps.core.services.number_sequence import NumberSequenceService
            self.payment_reference = NumberSequenceService.get_next_number("Supplier Payment", prefix="PAY-", padding=5)
        super().save(*args, **kwargs)
