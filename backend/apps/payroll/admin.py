from django.contrib import admin
from .models import PayrollRun, Payslip, PayslipLine, SalaryRule, SalaryStructure, TaxBracket, PayrollSetting

@admin.register(PayrollRun)
class PayrollRunAdmin(admin.ModelAdmin):
    list_display = ('name', 'period_start', 'period_end', 'status', 'total_net')
    list_filter = ('status',)
    search_fields = ('name',)

@admin.register(SalaryRule)
class SalaryRuleAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'category', 'amount_type', 'sequence', 'active')
    list_filter = ('category', 'amount_type', 'active')
    search_fields = ('code', 'name')

@admin.register(SalaryStructure)
class SalaryStructureAdmin(admin.ModelAdmin):
    list_display = ('code', 'name')
    filter_horizontal = ('rules',)

class PayslipLineInline(admin.TabularInline):
    model = PayslipLine
    extra = 0
    readonly_fields = ('name', 'code', 'category', 'amount', 'total')

@admin.register(Payslip)
class PayslipAdmin(admin.ModelAdmin):
    list_display = ('employee', 'date_from', 'date_to', 'status', 'net_amount')
    list_filter = ('status',)
    inlines = [PayslipLineInline]

@admin.register(TaxBracket)
class TaxBracketAdmin(admin.ModelAdmin):
    list_display = ('currency', 'min_amount', 'max_amount', 'tax_rate')
    list_filter = ('currency',)

@admin.register(PayrollSetting)
class PayrollSettingAdmin(admin.ModelAdmin):
    list_display = ('name', 'key', 'value')
