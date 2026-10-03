import uuid
from decimal import Decimal
from rest_framework import serializers  # type: ignore
from django.db import transaction  # type: ignore
from apps.core.models import Currency  # type: ignore
from .models import (  # type: ignore
    ChartOfAccount, Journal, JournalBatch, JournalEntry, JournalLine, 
    FiscalPeriod, FiscalYear, ExchangeRate, PostingProfile,
    Supplier, SupplierInvoice, SupplierInvoiceLine, SupplierPayment,
    CustomerProfile, CustomerInvoice, CustomerInvoiceLine, CustomerReceipt,
    BankAccount,
    TaxCode, TaxTransaction
)


class ChartOfAccountSerializer(serializers.ModelSerializer):
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    normal_balance = serializers.ReadOnlyField()

    class Meta:
        model = ChartOfAccount
        fields = '__all__'


class JournalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Journal
        fields = '__all__'


class JournalBatchSerializer(serializers.ModelSerializer):
    maker_name = serializers.SerializerMethodField()
    checker_name = serializers.SerializerMethodField()
    journal_code = serializers.CharField(source='journal.code', read_only=True)
    journal_name = serializers.CharField(source='journal.name', read_only=True)
    period_name = serializers.CharField(source='fiscal_period.name', read_only=True)
    entries_count = serializers.SerializerMethodField()
    
    class Meta:
        model = JournalBatch
        fields = '__all__'
        read_only_fields = ['status', 'total_debits', 'total_credits', 'maker', 'checker', 'approved_at', 'posted_by', 'posted_at', 'batch_number']

    def get_maker_name(self, obj):
        if obj.maker:
            return f"{obj.maker.first_name} {obj.maker.last_name}".strip()
        return "Unknown"

    def get_checker_name(self, obj):
        if obj.checker:
            return f"{obj.checker.first_name} {obj.checker.last_name}".strip()
        return None

    def get_entries_count(self, obj):
        return obj.entries.count()
        
    def create(self, validated_data):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['maker'] = request.user
        return super().create(validated_data)


class JournalLineSerializer(serializers.ModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    entity_name = serializers.SerializerMethodField()
    entry_reference = serializers.CharField(source='entry.reference', read_only=True)
    entry_date = serializers.DateField(source='entry.entry_date', read_only=True)

    class Meta:
        model = JournalLine
        fields = [
            'id', 'account', 'account_code', 'account_name', 
            'side', 'amount', 'amount_currency', 'description', 
            'vat_amount', 'entry_reference', 'entry_date',
            'contact_ref', 'supplier_ref', 'employee_ref', 'cost_center', 'property_ref',
            'entity_name'
        ]
        extra_kwargs = {
            'account': {'required': False},  # Can be inferred from entity
            'side': {'required': True},
            'amount': {'required': False}, 
            'amount_currency': {'required': True}
        }

    def get_entity_name(self, obj):
        if obj.contact_ref:
            return f"{obj.contact_ref.first_name} {obj.contact_ref.last_name}"
        if obj.supplier_ref:
            return obj.supplier_ref.name
        if obj.employee_ref:
            return f"{obj.employee_ref.first_name} {obj.employee_ref.last_name}"
        return None


class JournalEntrySerializer(serializers.ModelSerializer):
    lines = JournalLineSerializer(many=True, required=False)  # type: ignore
    journal_code = serializers.CharField(source='journal.code', read_only=True)
    journal_name = serializers.CharField(source='journal.name', read_only=True)
    period_name = serializers.CharField(source='fiscal_period.name', read_only=True)
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    total_debits = serializers.SerializerMethodField()
    total_credits = serializers.SerializerMethodField()
    is_balanced = serializers.SerializerMethodField()
    batch_number = serializers.CharField(source='batch.batch_number', read_only=True)

    class Meta:
        model = JournalEntry
        fields = '__all__'
        read_only_fields = ['reference', 'status', 'posted_at', 'posted_by']
        extra_kwargs = {
            'fiscal_period': {'required': False},
            'description': {'required': True}
        }

    def get_created_by_name(self, obj):
        if obj.created_by:
            return f"{obj.created_by.first_name} {obj.created_by.last_name}"
        return "System"

    def validate(self, data):
        """Foreign-currency entries without an explicit rate use the stored rate for the entry date."""
        currency = data.get('currency')
        exchange_rate = data.get('exchange_rate', Decimal('1.0000000000'))

        if currency and not currency.is_base and exchange_rate == Decimal('1.0000000000') and data.get('entry_date'):
            from apps.finance.services.accounting import AccountingError  # type: ignore
            from apps.finance.services.fx import get_rate  # type: ignore
            try:
                data['exchange_rate'] = get_rate(currency, data['entry_date'])
            except AccountingError as e:
                raise serializers.ValidationError({'exchange_rate': str(e)})

        return data

    def get_total_debits(self, obj):
        return str(obj.get_total_debits())

    def get_total_credits(self, obj):
        return str(obj.get_total_credits())

    def get_is_balanced(self, obj):
        return obj.is_balanced()

    def create(self, validated_data):
        # Set created_by from request context
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            validated_data['created_by'] = request.user

        # Remove fiscal_period and lines from validated_data so create() doesn't fail
        # lines are handled separately below
        validated_data.pop('lines', None)
        fiscal_period = validated_data.pop('fiscal_period', None)
        entry_date = validated_data.get('entry_date')

        # Auto-pick fiscal period based on date if not explicitly provided or to ensure correctness
        if entry_date:
            try:
                fiscal_period = FiscalPeriod.objects.filter(
                    start_date__lte=entry_date,
                    end_date__gte=entry_date,
                    status='open',
                    fiscal_year__is_closed=False
                ).first()
                if not fiscal_period:
                    raise serializers.ValidationError({"entry_date": "No open fiscal period found for this date."})
            except Exception as e:
                raise serializers.ValidationError({"entry_date": f"Error resolving fiscal period: {str(e)}"})

        validated_data['fiscal_period'] = fiscal_period
        
        # We don't take lines from validated_data because they are DRF-serialized
        # but the model field is read-only. We use the raw request data for lines.
        lines_data = self.context.get('view').request.data.get('lines', [])
        
        # Auto-generate reference if not present
        if not validated_data.get('reference'):
            from apps.core.services.number_sequence import NumberSequenceService  # type: ignore
            journal = validated_data.get('journal')
            try:
                validated_data['reference'] = NumberSequenceService.get_next_number(
                    f"Journal {journal.code}", 
                    prefix=f"{journal.code}-", 
                    padding=6
                )
            except Exception:
                # Fallback if sequence service fails
                u_str = str(uuid.uuid4().hex)
                u_short = u_str[0:8]  # type: ignore
                validated_data['reference'] = f"J-TMP-{u_short.upper()}"

        with transaction.atomic():
            entry = JournalEntry.objects.create(**validated_data)
            
            exchange_rate = entry.exchange_rate
            for line_data in lines_data:
                # 1. Resolve Account from Entity if account not provided
                account_id = line_data.get('account')
                contact_id = line_data.get('contact_ref')
                supplier_id = line_data.get('supplier_ref')
                employee_id = line_data.get('employee_ref')

                account = None
                if account_id:
                    account = ChartOfAccount.objects.get(pk=account_id)
                elif contact_id:
                    # Target AR Control Account
                    customer = CustomerProfile.objects.get(contact_link_id=contact_id)
                    account = customer.ar_account
                elif supplier_id:
                    # Target AP Control Account
                    supplier = Supplier.objects.get(pk=supplier_id)
                    account = supplier.ap_account
                elif employee_id:
                    # Staff control account: Net Salaries Payable (was 2100, which is VAT Payable).
                    account = ChartOfAccount.objects.filter(code='2630').first()

                if not account:
                    raise serializers.ValidationError({"lines": "Account could not be resolved for one or more lines."})

                # 2. Calculate reporting amount
                amount_currency = Decimal(str(line_data.get('amount_currency', '0.00')))
                amount = (amount_currency * exchange_rate).quantize(Decimal('0.01'))

                JournalLine.objects.create(
                    entry=entry,
                    account=account,
                    side=line_data.get('side'),
                    amount_currency=amount_currency,
                    amount=amount,
                    description=line_data.get('description', ''),
                    contact_ref_id=contact_id,
                    supplier_ref_id=supplier_id,
                    employee_ref_id=employee_id,
                    cost_center_id=line_data.get('cost_center') or None,
                    property_ref_id=line_data.get('property_ref') or None,
                )
            
        return entry

    def update(self, instance, validated_data):
        # Set updated_by from request
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            instance.updated_by = request.user

        # Handle nested lines
        lines_data = self.context.get('view').request.data.get('lines', [])
        
        with transaction.atomic():
            # Update basic fields
            validated_data.pop('lines', None)
            
            # Auto-update fiscal period if entry_date changed
            entry_date = validated_data.get('entry_date', instance.entry_date)
            if entry_date:
                fiscal_period = FiscalPeriod.objects.filter(
                    start_date__lte=entry_date,
                    end_date__gte=entry_date,
                    status='open',
                    fiscal_year__is_closed=False
                ).first()
                if fiscal_period:
                    validated_data['fiscal_period'] = fiscal_period

            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            instance.save()
            
            # If lines_data is provided, replace existing lines
            if lines_data:
                instance.lines.all().delete()
                
                exchange_rate = instance.exchange_rate
                for line_data in lines_data:
                    account_id = line_data.get('account')
                    contact_id = line_data.get('contact_ref')
                    supplier_id = line_data.get('supplier_ref')
                    employee_id = line_data.get('employee_ref')

                    account = None
                    if account_id:
                        account = ChartOfAccount.objects.get(pk=account_id)
                    elif contact_id:
                        customer = CustomerProfile.objects.get(contact_link_id=contact_id)
                        account = customer.ar_account
                    elif supplier_id:
                        supplier = Supplier.objects.get(pk=supplier_id)
                        account = supplier.ap_account
                    elif employee_id:
                        account = ChartOfAccount.objects.filter(code='2630').first()

                    if not account:
                         raise serializers.ValidationError({"lines": "Account could not be resolved."})

                    amount_currency = Decimal(str(line_data.get('amount_currency', '0.00')))
                    amount = (amount_currency * exchange_rate).quantize(Decimal('0.01'))

                    JournalLine.objects.create(
                        entry=instance,
                        account=account,
                        side=line_data.get('side'),
                        amount_currency=amount_currency,
                        amount=amount,
                        description=line_data.get('description', ''),
                        contact_ref_id=contact_id,
                        supplier_ref_id=supplier_id,
                        employee_ref_id=employee_id,
                        cost_center_id=line_data.get('cost_center') or None,
                        property_ref_id=line_data.get('property_ref') or None,
                    )
        
        return instance

class FiscalYearSerializer(serializers.ModelSerializer):
    class Meta:
        model = FiscalYear
        fields = '__all__'


class FiscalPeriodSerializer(serializers.ModelSerializer):
    fiscal_year_name = serializers.CharField(source='fiscal_year.name', read_only=True)
    is_open = serializers.SerializerMethodField()

    class Meta:
        model = FiscalPeriod
        fields = '__all__'

    def get_is_open(self, obj):
        return obj.is_open_for_posting()

# ─── AP Serializers ──────────────────────────────────────────────────────────

class SupplierSerializer(serializers.ModelSerializer):
    balance = serializers.SerializerMethodField()
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    ap_account_code = serializers.CharField(source='ap_account.code', read_only=True, default=None)
    ap_account_name = serializers.CharField(source='ap_account.name', read_only=True, default=None)
    
    class Meta:
        model = Supplier
        fields = '__all__'

    def get_balance(self, obj):
        annotated = getattr(obj, 'ledger_balance', None)
        return str(annotated if annotated is not None else obj.balance)

class SupplierInvoiceLineSerializer(serializers.ModelSerializer):
    expense_account_code = serializers.CharField(source='expense_account.code', read_only=True)
    
    class Meta:
        model = SupplierInvoiceLine
        fields = ['id', 'description', 'expense_account', 'expense_account_code', 'quantity', 'unit_price', 'tax_code', 'tax_amount', 'line_total',
                  'cost_center', 'property_ref', 'po_line']

class SupplierInvoiceSerializer(serializers.ModelSerializer):
    lines = SupplierInvoiceLineSerializer(many=True)  # type: ignore
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    balance_due = serializers.SerializerMethodField()
    journal_entry_details = JournalEntrySerializer(source='journal_entry', read_only=True)  # type: ignore

    class Meta:
        model = SupplierInvoice
        fields = [
            'id', 'supplier', 'supplier_name', 'document_type', 'original_invoice', 'invoice_number', 'reference',
            'invoice_date', 'due_date', 'currency', 'currency_code', 'exchange_rate', 'subtotal', 'tax_total', 'total_amount',
            'amount_paid', 'status', 'journal_entry', 'journal_entry_details', 'balance_due', 'lines',
            'match_override_reason'
        ]
        read_only_fields = ['status', 'total_amount', 'subtotal', 'tax_total', 'amount_paid', 'journal_entry', 'exchange_rate']
        extra_kwargs = {
            'invoice_number': {'required': False}
        }

    def get_balance_due(self, obj):
        return str(obj.balance_due)

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        
        # Calculate totals from lines
        subtotal = Decimal('0.00')
        tax_total = Decimal('0.00')
        
        for line in lines_data:
            line_tax = Decimal(str(line.get('tax_amount', 0)))
            line_total = Decimal(str(line.get('line_total', 0)))
            tax_total += line_tax
            subtotal += (line_total - line_tax)

        validated_data['subtotal'] = subtotal
        validated_data['tax_total'] = tax_total
        validated_data['total_amount'] = subtotal + tax_total
            
        with transaction.atomic():
            invoice = SupplierInvoice.objects.create(**validated_data)
            for line_data in lines_data:
                SupplierInvoiceLine.objects.create(invoice=invoice, **line_data)
            
        return invoice

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            
            if lines_data is not None:
                subtotal = Decimal('0.00')
                tax_total = Decimal('0.00')
                instance.lines.all().delete()
                
                for line_data in lines_data:
                    line_tax = Decimal(str(line_data.get('tax_amount', 0)))
                    line_total = Decimal(str(line_data.get('line_total', 0)))
                    tax_total += line_tax
                    subtotal += (line_total - line_tax)
                    SupplierInvoiceLine.objects.create(invoice=instance, **line_data)
                
                instance.subtotal = subtotal
                instance.tax_total = tax_total
                instance.total_amount = subtotal + tax_total
            
            instance.save()
        return instance

class SupplierPaymentSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source='supplier.name', read_only=True)
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True, default=None)
    journal_entry_details = JournalEntrySerializer(source='journal_entry', read_only=True)  # type: ignore

    class Meta:
        model = SupplierPayment
        fields = [
            'id', 'supplier', 'supplier_name', 'bank_account', 'bank_account_name', 'payment_date',
            'amount', 'currency', 'currency_code', 'exchange_rate', 'unapplied_amount', 'payment_reference', 'status',
            'journal_entry', 'journal_entry_details'
        ]
        read_only_fields = ['status', 'journal_entry', 'exchange_rate', 'unapplied_amount']

# ─── AR Serializers ──────────────────────────────────────────────────────────

class CustomerProfileSerializer(serializers.ModelSerializer):
    display_name = serializers.SerializerMethodField()
    ar_account_code = serializers.CharField(source='ar_account.code', read_only=True)
    ar_account_name = serializers.CharField(source='ar_account.name', read_only=True)
    balance = serializers.SerializerMethodField()
    
    class Meta:
        model = CustomerProfile
        fields = '__all__'
        
    def get_display_name(self, obj):
        return str(obj)

    def get_balance(self, obj):
        annotated = getattr(obj, 'ledger_balance', None)
        if annotated is None or obj.contact_link_id is None:
            return str(obj.balance)
        return str(annotated)

class CustomerInvoiceLineSerializer(serializers.ModelSerializer):
    revenue_account_code = serializers.CharField(source='revenue_account.code', read_only=True)
    
    class Meta:
        model = CustomerInvoiceLine
        fields = ['id', 'description', 'revenue_account', 'revenue_account_code', 'quantity', 'unit_price', 'tax_code', 'tax_amount', 'line_total',
                  'cost_center', 'property_ref']

class CustomerInvoiceSerializer(serializers.ModelSerializer):
    lines = CustomerInvoiceLineSerializer(many=True)  # type: ignore
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    balance_due = serializers.SerializerMethodField()
    journal_entry_details = JournalEntrySerializer(source='journal_entry', read_only=True)  # type: ignore

    class Meta:
        model = CustomerInvoice
        fields = [
            'id', 'customer', 'customer_name', 'document_type', 'original_invoice', 'invoice_number', 'reference',
            'invoice_date', 'due_date', 'currency', 'currency_code', 'exchange_rate', 'subtotal', 'tax_total', 'total_amount',
            'amount_paid', 'status', 'journal_entry', 'journal_entry_details', 'balance_due', 'lines'
        ]
        read_only_fields = ['invoice_number', 'status', 'total_amount', 'subtotal', 'tax_total', 'amount_paid', 'journal_entry',
                            'exchange_rate']

    def get_balance_due(self, obj):
        return str(obj.balance_due)

    def create(self, validated_data):
        lines_data = validated_data.pop('lines', [])
        
        # Calculate totals from lines
        subtotal = Decimal('0.00')
        tax_total = Decimal('0.00')
        
        for line in lines_data:
            line_tax = Decimal(str(line.get('tax_amount', 0)))
            line_total = Decimal(str(line.get('line_total', 0)))
            tax_total += line_tax
            subtotal += (line_total - line_tax)

        validated_data['subtotal'] = subtotal
        validated_data['tax_total'] = tax_total
        validated_data['total_amount'] = subtotal + tax_total
            
        with transaction.atomic():
            invoice = CustomerInvoice.objects.create(**validated_data)
            for line_data in lines_data:
                CustomerInvoiceLine.objects.create(invoice=invoice, **line_data)
            
        return invoice

    def update(self, instance, validated_data):
        lines_data = validated_data.pop('lines', None)
        
        with transaction.atomic():
            for attr, value in validated_data.items():
                setattr(instance, attr, value)
            
            if lines_data is not None:
                subtotal = Decimal('0.00')
                tax_total = Decimal('0.00')
                instance.lines.all().delete()
                
                for line_data in lines_data:
                    line_tax = Decimal(str(line_data.get('tax_amount', 0)))
                    line_total = Decimal(str(line_data.get('line_total', 0)))
                    tax_total += line_tax
                    subtotal += (line_total - line_tax)
                    CustomerInvoiceLine.objects.create(invoice=instance, **line_data)
                
                instance.subtotal = subtotal
                instance.tax_total = tax_total
                instance.total_amount = subtotal + tax_total
            
            instance.save()
        return instance

class CustomerReceiptSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.name', read_only=True)
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    journal_entry_details = JournalEntrySerializer(source='journal_entry', read_only=True)  # type: ignore

    class Meta:
        model = CustomerReceipt
        fields = [
            'id', 'customer', 'customer_name', 'bank_account', 'receipt_date',
            'amount', 'currency', 'currency_code', 'exchange_rate', 'unapplied_amount', 'receipt_reference', 'status',
            'journal_entry', 'journal_entry_details'
        ]
        read_only_fields = ['status', 'journal_entry', 'exchange_rate', 'unapplied_amount']

# ─── Bank Serializers ────────────────────────────────────────────────────────

class BankAccountSerializer(serializers.ModelSerializer):
    gl_account_code = serializers.CharField(source='gl_account.code', read_only=True)
    
    class Meta:
        model = BankAccount
        fields = '__all__'

# ─── Tax Serializers ─────────────────────────────────────────────────────────

class TaxCodeSerializer(serializers.ModelSerializer):
    collected_account_code = serializers.CharField(source='collected_account.code', read_only=True)
    paid_account_code = serializers.CharField(source='paid_account.code', read_only=True)
    
    class Meta:
        model = TaxCode
        fields = '__all__'

class TaxTransactionSerializer(serializers.ModelSerializer):
    tax_code_str = serializers.CharField(source='tax_code.code', read_only=True)
    
    class Meta:
        model = TaxTransaction
        fields = '__all__'


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = '__all__'


class ExchangeRateSerializer(serializers.ModelSerializer):
    currency_code = serializers.CharField(source='currency.code', read_only=True)

    class Meta:
        model = ExchangeRate
        fields = '__all__'


class PostingProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = PostingProfile
        fields = '__all__'
