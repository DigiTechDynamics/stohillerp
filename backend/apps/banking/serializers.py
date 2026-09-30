from rest_framework import serializers

from apps.banking.models import CorporateBankStatement, CorporateBankStatementLine, ReconciliationRule
from apps.banking.services.reconciliation import signed
from apps.finance.models import BankAccount


class BankAccountSerializer(serializers.ModelSerializer):
    """The unified bank account (finance.BankAccount), as the banking screens use it."""
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    gl_account_code = serializers.CharField(source='gl_account.code', read_only=True)
    gl_account_name = serializers.CharField(source='gl_account.name', read_only=True)
    current_balance = serializers.SerializerMethodField()
    unreconciled_lines = serializers.SerializerMethodField()

    class Meta:
        model = BankAccount
        fields = ['id', 'code', 'name', 'bank_name', 'branch_code', 'account_number', 'iban', 'swift_bic',
                  'account_type', 'currency', 'currency_code', 'gl_account', 'gl_account_code', 'gl_account_name',
                  'opening_balance', 'current_balance', 'unreconciled_lines', 'is_active']
        extra_kwargs = {'name': {'required': False}}

    def get_current_balance(self, obj):
        return str(obj.book_balance())

    def get_unreconciled_lines(self, obj):
        return CorporateBankStatementLine.objects.filter(statement__bank_account=obj, is_reconciled=False).count()

    def validate(self, attrs):
        if not attrs.get('name') and not getattr(self.instance, 'name', None):
            attrs['name'] = attrs.get('code') or attrs.get('bank_name', 'Bank account')
        return attrs


class CorporateBankStatementLineSerializer(serializers.ModelSerializer):
    ledger_reference = serializers.CharField(source='journal_entry_line.entry.reference', read_only=True, default=None)

    class Meta:
        model = CorporateBankStatementLine
        fields = ['id', 'statement', 'transaction_date', 'value_date', 'reference', 'description', 'amount',
                  'is_reconciled', 'journal_entry_line', 'ledger_reference']
        read_only_fields = ['is_reconciled', 'journal_entry_line']


class CorporateBankStatementSerializer(serializers.ModelSerializer):
    lines = CorporateBankStatementLineSerializer(many=True, read_only=True)
    bank_account_code = serializers.CharField(source='bank_account.code', read_only=True)
    bank_account_name = serializers.CharField(source='bank_account.name', read_only=True)

    class Meta:
        model = CorporateBankStatement
        fields = ['id', 'bank_account', 'bank_account_code', 'bank_account_name', 'reference', 'statement_date',
                  'opening_balance', 'closing_balance', 'status', 'lines']
        read_only_fields = ['status']


class LedgerLineSerializer(serializers.Serializer):
    """An unmatched GL line on the bank account, signed like a statement line."""
    id = serializers.UUIDField()
    date = serializers.DateField(source='entry.entry_date')
    reference = serializers.CharField(source='entry.reference')
    source_reference = serializers.CharField(source='entry.source_reference')
    description = serializers.SerializerMethodField()
    amount = serializers.SerializerMethodField()

    def get_description(self, obj):
        return obj.description or obj.entry.description

    def get_amount(self, obj):
        return str(signed(obj))


class ReconciliationRuleSerializer(serializers.ModelSerializer):
    target_account_name = serializers.CharField(source='target_account.name', read_only=True)

    class Meta:
        model = ReconciliationRule
        fields = '__all__'
