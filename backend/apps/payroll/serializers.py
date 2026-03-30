from rest_framework import serializers
from .models import PayrollRun, Payslip, PayslipLine, TaxBracket, PayrollSetting, SalaryStructure, SalaryRule
from apps.hr.models import Employee

class PayslipLineSerializer(serializers.ModelSerializer):
    class Meta:
        model = PayslipLine
        fields = '__all__'

class PayslipSerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.full_name')
    employee_code = serializers.ReadOnlyField(source='employee.employee_number')
    employee_job_title = serializers.ReadOnlyField(source='contract.job_position.name')
    lines = PayslipLineSerializer(many=True, read_only=True)
    
    gross_amount = serializers.SerializerMethodField()
    tax_amount = serializers.SerializerMethodField()
    nssa_amount = serializers.SerializerMethodField()
    aids_amount = serializers.SerializerMethodField()
    net_amount = serializers.ReadOnlyField()

    class Meta:
        model = Payslip
        fields = '__all__'

    def get_gross_amount(self, obj):
        return sum(line.total for line in obj.lines.all() if line.category in ['basic', 'allowance'])

    def get_tax_amount(self, obj):
        return sum(line.total for line in obj.lines.all() if line.code == 'PAYE')

    def get_nssa_amount(self, obj):
        return sum(line.total for line in obj.lines.all() if line.code == 'NSSA')

    def get_aids_amount(self, obj):
        return sum(line.total for line in obj.lines.all() if line.code == 'AIDS')

class PayrollRunSerializer(serializers.ModelSerializer):
    item_count = serializers.IntegerField(source='payslips.count', read_only=True)
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
