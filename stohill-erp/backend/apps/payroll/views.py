from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.utils import timezone
from django.db import transaction, models
from decimal import Decimal
from .models import PayrollRun, PayrollItem
from .serializers import PayrollRunSerializer, PayrollItemSerializer
from apps.hr.models import Employee
from apps.commissions.models import CommissionRecord
from apps.core.models import Currency
from .services.zimbabwe import ZimbabweTaxService
from apps.finance.models.ap import Supplier, SupplierInvoice, SupplierInvoiceLine
from apps.finance.models.core import ChartOfAccount

class PayrollRunViewSet(viewsets.ModelViewSet):
    queryset = PayrollRun.objects.all()
    serializer_class = PayrollRunSerializer

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        payroll_run = self.get_object()
        if payroll_run.status != PayrollRun.Status.DRAFT:
            return Response({'error': 'Can only process draft payroll runs'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            # 0. Assign Currency if not set
            if not payroll_run.currency_id:
                try:
                    base_currency = Currency.objects.get(is_base=True)
                    payroll_run.currency = base_currency
                except Currency.DoesNotExist:
                    pass

            # 1. Clear existing items
            payroll_run.items.all().delete()
            
            # 2. Find eligible employees
            employees = Employee.objects.filter(status='active')
            
            total_gross = Decimal('0.00')
            total_net = Decimal('0.00')
            payroll_run.total_deductions = Decimal('0.00')
            
            for emp in employees:
                # Calculate commissions for this period
                commissions = CommissionRecord.objects.filter(
                    agent=emp,
                    status='approved',
                    approved_date__range=(payroll_run.period_start, payroll_run.period_end)
                ).aggregate(total=models.Sum('net_commission'))['total'] or Decimal('0.00')

                # Calculate Deductions (Zimbabwe Environment)
                gross_for_tax = emp.basic_salary + commissions
                currency_code = payroll_run.currency.code if payroll_run.currency else "USD"
                
                paye = ZimbabweTaxService.calculate_paye(gross_for_tax, currency_code)
                aids_levy = ZimbabweTaxService.calculate_aids_levy(paye)
                nssa = ZimbabweTaxService.calculate_nssa(emp.basic_salary, currency_code)

                item = PayrollItem.objects.create(
                    payroll_run=payroll_run,
                    employee=emp,
                    basic_salary=emp.basic_salary,
                    commission_amount=commissions,
                    tax_amount=paye,
                    aids_levy=aids_levy,
                    nssa_deduction=nssa,
                    bank_account_snapshot=f"{emp.bank_name} / {emp.bank_account_number}"
                )
                total_gross += item.gross_amount
                total_net += item.net_amount
                payroll_run.total_deductions += (paye + aids_levy + nssa)
            
            # 3. Update run totals
            payroll_run.total_gross = total_gross
            payroll_run.total_net = total_net
            payroll_run.status = PayrollRun.Status.PROCESSING
            payroll_run.processed_at = timezone.now()
            payroll_run.processed_by = request.user if request.user.is_authenticated else None
            
            # 4. Create/Update Supplier Invoice in AP
            # Ensure "Staff Payroll" supplier exists
            wage_account = ChartOfAccount.objects.filter(code='5900').first()
            if not wage_account:
                # Fallback to any expense account if 5900 is missing
                wage_account = ChartOfAccount.objects.filter(account_type='expense').first()

            supplier, _ = Supplier.objects.get_or_create(
                name="Staff Payroll",
                defaults={
                    'ap_account': ChartOfAccount.objects.filter(account_sub_type='payable').first(),
                    'currency': payroll_run.currency
                }
            )

            # Create or update the invoice
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

            # Create/Reset invoice lines
            invoice.lines.all().delete()
            SupplierInvoiceLine.objects.create(
                invoice=invoice,
                description=f"Net Payroll: {payroll_run.name}",
                expense_account=wage_account,
                unit_price=total_net,
                line_total=total_net
            )

            payroll_run.save()

        return Response(PayrollRunSerializer(payroll_run).data)

    @action(detail=True, methods=['post'])
    def pay_all(self, request, pk=None):
        payroll_run = self.get_object()
        if payroll_run.status != PayrollRun.Status.APPROVED:
            return Response({'error': 'Can only pay approved payroll runs'}, status=status.HTTP_400_BAD_REQUEST)
        
        with transaction.atomic():
            payroll_run.items.all().update(status=PayrollItem.Status.PAID)
            payroll_run.status = PayrollRun.Status.PAID
            payroll_run.save()
            
            # Mark commissions as paid
            for item in payroll_run.items.all():
                CommissionRecord.objects.filter(
                    agent=item.employee,
                    status='approved',
                    approved_date__range=(payroll_run.period_start, payroll_run.period_end)
                ).update(status='paid', payment_date=timezone.now().date(), payment_reference=f"PAY-{payroll_run.id}")

        return Response(PayrollRunSerializer(payroll_run).data)

class PayrollItemViewSet(viewsets.ModelViewSet):
    queryset = PayrollItem.objects.all()
    serializer_class = PayrollItemSerializer
    filterset_fields = ['payroll_run', 'employee', 'status']

    @action(detail=True, methods=['get'])
    def payslip(self, request, pk=None):
        item = self.get_object()
        # Basic payslip data with company/employee/run context
        data = {
            'id': item.id,
            'employee': {
                'name': item.employee.full_name,
                'number': item.employee.employee_number,
                'job_title': item.employee.job_title,
                'bank': item.employee.bank_name,
                'account': item.employee.bank_account_number,
            },
            'run': {
                'name': item.payroll_run.name,
                'period': f"{item.payroll_run.period_start} to {item.payroll_run.period_end}",
                'currency': item.payroll_run.currency.code if item.payroll_run.currency else "USD",
                'symbol': item.payroll_run.currency.symbol if item.payroll_run.currency else "$",
            },
            'earnings': [
                {'label': 'Basic Salary', 'amount': item.basic_salary},
                {'label': 'Commissions', 'amount': item.commission_amount},
                {'label': 'Bonus', 'amount': item.bonus},
            ],
            'deductions': [
                {'label': 'PAYE Tax', 'amount': item.tax_amount},
                {'label': 'AIDS Levy', 'amount': item.aids_levy},
                {'label': 'NSSA Pension', 'amount': item.nssa_deduction},
                {'label': 'Other', 'amount': item.other_deductions},
            ],
            'totals': {
                'gross': item.gross_amount,
                'net': item.net_amount,
            }
        }
        return Response(data)

from .serializers import TaxBracketSerializer, PayrollSettingSerializer
from .models import TaxBracket, PayrollSetting

class TaxBracketViewSet(viewsets.ModelViewSet):
    queryset = TaxBracket.objects.all()
    serializer_class = TaxBracketSerializer
    filterset_fields = ['currency']

class PayrollSettingViewSet(viewsets.ModelViewSet):
    queryset = PayrollSetting.objects.all()
    serializer_class = PayrollSettingSerializer
