from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction, models
from decimal import Decimal
from .models import PayrollRun, Payslip, PayslipLine, SalaryStructure
from .serializers import PayrollRunSerializer, PayslipSerializer
from apps.hr.models import Employee, EmployeeContract
from apps.commissions.models import CommissionRecord
from apps.core.models import Currency
from .services.zimbabwe import ZimbabweTaxService
from apps.finance.models.ap import Supplier, SupplierInvoice, SupplierInvoiceLine
from apps.finance.models.core import ChartOfAccount, Journal, JournalEntry, JournalLine, FiscalPeriod
from apps.core.services.number_sequence import NumberSequenceService
from apps.core.permissions import IsFinanceAdminOrAccountant
from rest_framework.permissions import IsAuthenticated

class PayrollRunViewSet(viewsets.ModelViewSet):
    queryset = PayrollRun.objects.all()
    serializer_class = PayrollRunSerializer

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        payroll_run = self.get_object()
        if payroll_run.status in [PayrollRun.Status.APPROVED, PayrollRun.Status.PAID, PayrollRun.Status.CANCELLED]:
            return Response({'error': 'Can only process draft or processing payroll runs'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # 0. Assign Currency if not set
            if not payroll_run.currency_id:
                try:
                    base_currency = Currency.objects.get(is_base=True)
                    payroll_run.currency = base_currency
                except Currency.DoesNotExist:
                    pass

            # 1. Clear existing items
            payroll_run.payslips.all().delete()
            
            # 2. Find eligible employees with running contracts
            contracts = EmployeeContract.objects.filter(status='running').select_related('employee', 'job_position')
            structure = SalaryStructure.objects.first()
            
            total_gross = Decimal('0.00')
            total_net = Decimal('0.00')
            payroll_run.total_deductions = Decimal('0.00')
            
            for contract in contracts:
                emp = contract.employee
                
                payslip = Payslip.objects.create(
                    payroll_run=payroll_run,
                    employee=emp,
                    contract=contract,
                    structure=structure,
                    date_from=payroll_run.period_start,
                    date_to=payroll_run.period_end,
                )

                commissions = CommissionRecord.objects.filter(
                    agent=emp,
                    status='approved',
                    approved_date__range=(payroll_run.period_start, payroll_run.period_end)
                ).aggregate(total=models.Sum('net_commission'))['total'] or Decimal('0.00')

                currency_code = payroll_run.currency.code if payroll_run.currency else "USD"
                
                rule_totals = {}
                emp_gross = Decimal('0.00')
                emp_net = Decimal('0.00')
                emp_deduc = Decimal('0.00')
                
                # We will track mapped GL accounts globally for the Journal Entry
                if not hasattr(payroll_run, '_gl_lines'):
                    payroll_run._gl_lines = {}


                if structure:
                    for rule in structure.rules.all().order_by('sequence'):
                        amount = Decimal('0.00')
                        if rule.code == 'BASIC':
                            amount = contract.wage
                        elif rule.code == 'COMM':
                            amount = commissions
                        elif rule.code == 'PAYE':
                            tax_gross = contract.wage + commissions
                            amount = ZimbabweTaxService.calculate_paye(tax_gross, currency_code)
                        elif rule.code == 'AIDS':
                            amount = ZimbabweTaxService.calculate_aids_levy(rule_totals.get('PAYE', Decimal('0.00')))
                        elif rule.code == 'NSSA':
                            amount = ZimbabweTaxService.calculate_nssa(contract.wage, currency_code)
                        elif rule.code == 'SDL':
                            amount = ZimbabweTaxService.calculate_sdl(emp_gross or contract.wage)
                        elif rule.code == 'ZIMDEF':
                            amount = ZimbabweTaxService.calculate_zimdef(emp_gross or contract.wage)
                        elif rule.amount_type == 'fixed':
                            amount = rule.fixed_amount
                        elif rule.amount_type == 'percentage':
                            amount = (emp_gross or contract.wage) * (rule.percentage / Decimal('100.00'))

                        if rule.category == 'net':
                            amount = emp_net  # calculate net before applying rule

                        rule_totals[rule.code] = amount

                        if amount != 0 or rule.category == 'net':
                            PayslipLine.objects.create(
                                payslip=payslip,
                                salary_rule=rule,
                                name=rule.name,
                                code=rule.code,
                                category=rule.category,
                                amount=amount,
                                total=amount
                            )
                            
                            # Accumulate for GL Journal Entry
                            if amount > 0:
                                if rule.debit_account:
                                    cd = rule.debit_account.id
                                    payroll_run._gl_lines.setdefault(cd, {'account': rule.debit_account, 'debit': Decimal('0.00'), 'credit': Decimal('0.00')})
                                    payroll_run._gl_lines[cd]['debit'] += amount
                                if rule.credit_account:
                                    cc = rule.credit_account.id
                                    payroll_run._gl_lines.setdefault(cc, {'account': rule.credit_account, 'debit': Decimal('0.00'), 'credit': Decimal('0.00')})
                                    payroll_run._gl_lines[cc]['credit'] += amount

                        if rule.category in ['basic', 'allowance']:
                            emp_gross += amount
                            emp_net += amount
                        elif rule.category == 'deduction':
                            emp_deduc += amount
                            emp_net -= amount
                        elif rule.category == 'contribution':
                            # Employer contributions do not affect employee net pay
                            pass

                payslip.net_amount = emp_net
                payslip.bank_account_snapshot = f"{emp.bank_name} / {emp.bank_account_number}"  # Note: not in Payslip model; maybe we should just use contract?
                payslip.save()

                total_gross += emp_gross
                total_net += emp_net
                payroll_run.total_deductions += emp_deduc
            
            # 3. Update run totals
            payroll_run.total_gross = total_gross
            payroll_run.total_net = total_net
            payroll_run.status = PayrollRun.Status.PROCESSING
            payroll_run.processed_at = timezone.now()
            payroll_run.processed_by = request.user if request.user.is_authenticated else None
            
            # 4. Create/Update Supplier Invoice in AP
            wage_account = ChartOfAccount.objects.filter(code='5900').first()
            if not wage_account:
                wage_account = ChartOfAccount.objects.filter(account_type='expense').first()

            supplier, _ = Supplier.objects.get_or_create(
                name="Staff Payroll",
                defaults={
                    'ap_account': ChartOfAccount.objects.filter(account_sub_type='payable').first(),
                    'currency': payroll_run.currency
                }
            )

            invoice = payroll_run.supplier_invoice
            if not invoice:
                invoice = SupplierInvoice.objects.create(
                    supplier=supplier,
                    currency=payroll_run.currency,
                    invoice_date=timezone.now().date(),
                    due_date=payroll_run.period_end,
                    reference=f"PAYROLL-{payroll_run.id}",
                    status=SupplierInvoice.InvoiceStatus.DRAFT
                )
                payroll_run.supplier_invoice = invoice
            
            invoice.total_amount = total_net
            invoice.subtotal = total_net
            invoice.save()

            invoice.lines.all().delete()
            SupplierInvoiceLine.objects.create(
                invoice=invoice,
                description=f"Net Payroll: {payroll_run.name}",
                expense_account=wage_account,
                unit_price=total_gross, # Using Gross for full visibility in AP, though deductions offset it normally
                line_total=total_gross
            )

            # 5. Create Odoo-Style Direct Journal Entry if GL rules are configured
            if hasattr(payroll_run, '_gl_lines') and payroll_run._gl_lines:
                try:
                    journal, _ = Journal.objects.get_or_create(code='PAY', defaults={'name': 'Payroll Journal', 'auto_posting': True})
                    period = FiscalPeriod.objects.filter(start_date__lte=payroll_run.period_end, end_date__gte=payroll_run.period_end).first()
                    
                    if period and period.is_open_for_posting():
                        je_ref = NumberSequenceService.get_next_number('JournalEntry', prefix='JE-PAY-', padding=4)
                        je = JournalEntry.objects.create(
                            reference=je_ref,
                            journal=journal,
                            fiscal_period=period,
                            currency=payroll_run.currency,
                            entry_type='payroll',
                            status='approved',
                            entry_date=payroll_run.period_end,
                            description=f"Payroll Run - {payroll_run.name}",
                            source_module='payroll',
                            source_id=payroll_run.id
                        )
                        
                        for gl_data in payroll_run._gl_lines.values():
                            if gl_data['debit'] > 0:
                                JournalLine.objects.create(entry=je, account=gl_data['account'], side='debit', amount=gl_data['debit'], amount_currency=gl_data['debit'])
                            if gl_data['credit'] > 0:
                                JournalLine.objects.create(entry=je, account=gl_data['account'], side='credit', amount=gl_data['credit'], amount_currency=gl_data['credit'])
                except Exception as e:
                    pass # Silently fail GL posting if Finance period isn't setup

            payroll_run.save()

        return Response(PayrollRunSerializer(payroll_run).data)

    @action(detail=True, methods=['post'])
    def pay_all(self, request, pk=None):
        payroll_run = self.get_object()
        if payroll_run.status != PayrollRun.Status.APPROVED:
            return Response({'error': 'Can only pay approved payroll runs'}, status=status.HTTP_400_BAD_REQUEST)
        
        with transaction.atomic():
            payroll_run.payslips.all().update(status=Payslip.Status.PAID)
            payroll_run.status = PayrollRun.Status.PAID
            payroll_run.save()
            
            # Mark commissions as paid
            for payslip in payroll_run.payslips.all():
                CommissionRecord.objects.filter(
                    agent=payslip.employee,
                    status='approved',
                    approved_date__range=(payroll_run.period_start, payroll_run.period_end)
                ).update(status='paid', payment_date=timezone.now().date(), payment_reference=f"PAY-{payroll_run.id}")

        return Response(PayrollRunSerializer(payroll_run).data)

class PayslipViewSet(viewsets.ModelViewSet):
    queryset = Payslip.objects.prefetch_related('lines').select_related('employee', 'payroll_run', 'contract')
    serializer_class = PayslipSerializer
    filterset_fields = ['payroll_run', 'employee', 'status']

    @action(detail=True, methods=['get'])
    def details(self, request, pk=None):
        payslip = self.get_object()
        data = {
            'id': payslip.id,
            'employee': {
                'name': payslip.employee.full_name,
                'number': payslip.employee.employee_number,
                'contract': payslip.contract.job_position.name if payslip.contract and payslip.contract.job_position else None,
                'bank': payslip.employee.bank_name,
                'account': payslip.employee.bank_account_number,
            },
            'run': {
                'name': payslip.payroll_run.name,
                'period': f"{payslip.payroll_run.period_start} to {payslip.payroll_run.period_end}",
                'currency': payslip.payroll_run.currency.code if payslip.payroll_run.currency else "USD",
                'symbol': payslip.payroll_run.currency.symbol if payslip.payroll_run.currency else "$",
            },
            'lines': [
                {
                    'name': line.name,
                    'code': line.code,
                    'category': line.category,
                    'amount': line.amount
                } for line in payslip.lines.all()
            ],
            'totals': {
                'gross': sum(line.amount for line in payslip.lines.all() if line.category in ['basic', 'allowance']),
                'deductions': sum(line.amount for line in payslip.lines.all() if line.category == 'deduction'),
                'net': payslip.net_amount,
            }
        }
        return Response(data)

from .serializers import TaxBracketSerializer, PayrollSettingSerializer, PayslipLineSerializer
from .models import TaxBracket, PayrollSetting, SalaryRule, SalaryStructure
from rest_framework import serializers as drf_serializers

class TaxBracketViewSet(viewsets.ModelViewSet):
    queryset = TaxBracket.objects.all()
    serializer_class = TaxBracketSerializer
    permission_classes = [IsAuthenticated, IsFinanceAdminOrAccountant]
    filterset_fields = ['currency']

class PayrollSettingViewSet(viewsets.ModelViewSet):
    queryset = PayrollSetting.objects.all()
    serializer_class = PayrollSettingSerializer
    permission_classes = [IsAuthenticated, IsFinanceAdminOrAccountant]

class SalaryRuleSerializer(drf_serializers.ModelSerializer):
    class Meta:
        model = SalaryRule
        fields = '__all__'

class SalaryStructureSerializer(drf_serializers.ModelSerializer):
    rules = SalaryRuleSerializer(many=True, read_only=True)
    rule_ids = drf_serializers.PrimaryKeyRelatedField(
        queryset=SalaryRule.objects.all(), many=True, write_only=True, source='rules'
    )
    class Meta:
        model = SalaryStructure
        fields = '__all__'

class SalaryRuleViewSet(viewsets.ModelViewSet):
    queryset = SalaryRule.objects.all()
    serializer_class = SalaryRuleSerializer
    filterset_fields = ['category', 'active']

class SalaryStructureViewSet(viewsets.ModelViewSet):
    queryset = SalaryStructure.objects.prefetch_related('rules').all()
    serializer_class = SalaryStructureSerializer
