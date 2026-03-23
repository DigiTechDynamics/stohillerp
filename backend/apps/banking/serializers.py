from rest_framework import serializers
from apps.banking.models import (
    CorporateBankAccount, CorporateBankStatement, 
    CorporateBankStatementLine, ReconciliationRule
)

class CorporateBankAccountSerializer(serializers.ModelSerializer):
    currency_code = serializers.CharField(source='currency.code', read_only=True)
    gl_account_name = serializers.CharField(source='gl_account.name', read_only=True)

    class Meta:
        model = CorporateBankAccount
        fields = [
            'id', 'code', 'bank_name', 'branch_code', 'account_number', 
            'iban', 'swift_bic', 'account_type', 'currency', 'currency_code',
            'gl_account', 'gl_account_name', 'opening_balance', 
            'current_balance', 'is_active'
        ]

class CorporateBankStatementLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = CorporateBankStatementLine
        fields = '__all__'

class CorporateBankStatementSerializer(serializers.ModelSerializer):
    lines = CorporateBankStatementLineSerializer(many=True, read_only=True)
    bank_account_code = serializers.CharField(source='bank_account.code', read_only=True)

    class Meta:
        model = CorporateBankStatement
        fields = [
            'id', 'bank_account', 'bank_account_code', 'reference', 
            'statement_date', 'opening_balance', 'closing_balance', 
            'status', 'lines'
        ]

class ReconciliationRuleSerializer(serializers.ModelSerializer):
    target_account_name = serializers.CharField(source='target_account.name', read_only=True)

    class Meta:
        model = ReconciliationRule
        fields = '__all__'
