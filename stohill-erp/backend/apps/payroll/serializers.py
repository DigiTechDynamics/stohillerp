from rest_framework import serializers
from .models import PayrollRun, PayrollItem, TaxBracket, PayrollSetting
from apps.hr.models import Employee

class PayrollItemSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.full_name')
    employee_code = serializers.ReadOnlyField(source='employee.employee_number')

    class Meta:
        model = PayrollItem
        fields = '__all__'

class PayrollRunSerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(source='items.count', read_only=True)
    processed_by_name = serializers.ReadOnlyField(source='processed_by.full_name', default='System')
    currency_code = serializers.ReadOnlyField(source='currency.code')
    currency_symbol = serializers.ReadOnlyField(source='currency.symbol', default='$')
    invoice_number = serializers.ReadOnlyField(source='supplier_invoice.invoice_number')
    invoice_status = serializers.ReadOnlyField(source='supplier_invoice.status')

    class Meta:
        model = PayrollRun
        fields = '__all__'

class TaxBracketSerializer(serializers.ModelSerializer):
    currency_code = serializers.ReadOnlyField(source='currency.code')
    class Meta:
        model = TaxBracket
        fields = '__all__'

class PayrollSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayrollSetting
        fields = '__all__'
