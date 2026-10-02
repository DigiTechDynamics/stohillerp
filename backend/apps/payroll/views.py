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
from utils.record_rules import RecordRulesMixin

class PayrollRunViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = PayrollRun.objects.all()
    serializer_class = PayrollRunSerializer

    @action(detail=True, methods=['post'])
    def process(self, request, pk=None):
        payroll_run = self.get_object()
        if payroll_run.status in [PayrollRun.Status.APPROVED, PayrollRun.Status.PAID, PayrollRun.Status.CANCELLED]:
            return Response({'error': 'Can only process draft or processing payroll runs'}, status=status.HTTP_400_BAD_REQUEST)
        if JournalEntry.objects.filter(source_module='payroll', source_id=payroll_run.id,
                                       status=JournalEntry.EntryStatus.POSTED).exists():
            return Response({'error': 'This payroll run is already posted to the GL; reverse the entry before re-processing.'},
                            status=status.HTTP_400_BAD_REQUEST)

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
                        # Employer contributions: company cost, not deducted from pay.
                        elif rule.code == 'NSSA_ER':
                            amount = ZimbabweTaxService.calculate_employer_nssa(contract.wage, currency_code)
                        elif rule.code == 'ZIMDEF':
                            amount = ZimbabweTaxService.calculate_zimdef(emp_gross)
                        elif rule.amount_type == 'fixed':
                            amount = rule.fixed_amount
                        elif rule.amount_type == 'percentage':
                            amount = contract.wage * (rule.percentage / Decimal('100.00'))

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
            
            # 4. Accrue the payroll in the GL (Dr wages / Cr statutory + net pay
            #    liabilities, per the salary rules' accounts). Previously this
            #    built a JournalEntry by hand, never checked it balanced, left
            #    duplicates on every re-process and swallowed all errors.
            gl_warning = self._accrue_payroll(payroll_run, request.user)

            # 5. Net pay goes to AP (Staff Payroll) so it is paid like any
            #    other creditor. The line clears Net Salaries Payable; debiting
            #    wages here as well would have booked the expense twice.
            net_payable = ChartOfAccount.objects.filter(code='2630').first() or \
                ChartOfAccount.objects.filter(code='5900').first()
            supplier, _ = Supplier.objects.get_or_create(
                name="Staff Payroll",
                defaults={
                    'ap_account': ChartOfAccount.objects.filter(account_sub_type='payable').order_by('code').first(),
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
                expense_account=net_payable,
                unit_price=total_net,
                line_total=total_net
            )
            payroll_run.save()

        data = PayrollRunSerializer(payroll_run).data
        if gl_warning:
            data['gl_warning'] = gl_warning
        return Response(data)

    @staticmethod
    def _accrue_payroll(payroll_run, user):
        """
        (Re)build the payroll accrual entry for a run. It is left APPROVED for
        Finance to post (maker/checker), so it is replaced on re-processing
        until then. Returns a warning string instead of silently skipping.
        """
        from apps.finance.services.accounting import AccountingError, AccountingService

        existing = JournalEntry.objects.filter(source_module='payroll', source_id=payroll_run.id)
        if existing.filter(status=JournalEntry.EntryStatus.POSTED).exists():
            raise AccountingError('This payroll run is already posted to the GL; reverse it before re-processing.')
        JournalLine.objects.filter(entry__in=existing).delete()
        existing.delete()

        gl_lines = getattr(payroll_run, '_gl_lines', None)
        if not gl_lines:
            return 'No GL accounts are configured on the salary rules; nothing was accrued.'
        debits = sum(v['debit'] for v in gl_lines.values())
        credits = sum(v['credit'] for v in gl_lines.values())
        if debits != credits:
            return (f'Payroll GL accrual not created: salary rule accounts are unbalanced '
                    f'(Dr {debits} / Cr {credits}). Check the debit/credit accounts on each rule.')

        service = AccountingService(user=user)
        try:
            period = service._get_fiscal_period(payroll_run.period_end)
            journal = service._get_journal('PJ')
        except AccountingError as e:
            return f'Payroll GL accrual not created: {e}'

        entry = JournalEntry.objects.create(
            reference=service._generate_reference(journal.code),
            journal=journal,
            fiscal_period=period,
            currency=payroll_run.currency,
            entry_type=JournalEntry.EntryType.PAYROLL,
            status=JournalEntry.EntryStatus.APPROVED,
            entry_date=payroll_run.period_end,
            description=f"Payroll Run - {payroll_run.name}",
            source_module='payroll',
            source_id=payroll_run.id,
            source_reference=payroll_run.name,
            created_by=user,
        )
        lines = []
        for gl in gl_lines.values():
            for side in ('debit', 'credit'):
                if gl[side] > 0:
                    lines.append(JournalLine(entry=entry, account=gl['account'], side=side,
                                             amount=gl[side], amount_currency=gl[side]))
        JournalLine.objects.bulk_create(lines)
        return None

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

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Processed -> approved. Whoever processed the run can't approve it (maker/checker)."""
        payroll_run = self.get_object()
        if payroll_run.status != PayrollRun.Status.PROCESSING:
            return Response({'error': 'Only processed runs can be approved.'}, status=status.HTTP_400_BAD_REQUEST)
        if payroll_run.processed_by_id == request.user.pk:
            return Response({'error': 'You processed this run, so someone else must approve it.'},
                            status=status.HTTP_400_BAD_REQUEST)
        payroll_run.status = PayrollRun.Status.APPROVED
        payroll_run.save(update_fields=['status'])
        return Response(PayrollRunSerializer(payroll_run).data)

    @action(detail=True, methods=['get'])
    def statutory(self, request, pk=None):
        """
        Remittance summary for the run: PAYE and AIDS levy (ZIMRA P2),
        NSSA employee + employer (P4), ZIMDEF, with per-employee detail.
        """
        payroll_run = self.get_object()
        codes = ('PAYE', 'AIDS', 'NSSA', 'NSSA_ER', 'ZIMDEF')
        lines = PayslipLine.objects.filter(payslip__payroll_run=payroll_run, code__in=codes) \
            .select_related('payslip__employee')
        totals = {c: Decimal('0.00') for c in codes}
        per_employee = {}
        for line in lines:
            totals[line.code] += line.amount
            emp = line.payslip.employee
            row = per_employee.setdefault(emp.pk, {'employee_number': emp.employee_number, 'name': emp.full_name,
                                                   **{c: '0.00' for c in codes}})
            row[line.code] = str(Decimal(row[line.code]) + line.amount)
        gross = PayslipLine.objects.filter(payslip__payroll_run=payroll_run, category__in=['basic', 'allowance']) \
            .aggregate(total=models.Sum('amount'))['total'] or Decimal('0.00')
        return Response({
            'run': payroll_run.name, 'period_start': payroll_run.period_start, 'period_end': payroll_run.period_end,
            'currency': payroll_run.currency.code if payroll_run.currency else 'USD',
            'gross_pay': str(gross),
            'zimra_p2': {'paye': str(totals['PAYE']), 'aids_levy': str(totals['AIDS']),
                         'total': str(totals['PAYE'] + totals['AIDS'])},
            'nssa_p4': {'employee': str(totals['NSSA']), 'employer': str(totals['NSSA_ER']),
                        'total': str(totals['NSSA'] + totals['NSSA_ER'])},
            'zimdef': str(totals['ZIMDEF']),
            'employees': sorted(per_employee.values(), key=lambda r: r['employee_number']),
        })

    @action(detail=True, methods=['get'])
    def bank_file(self, request, pk=None):
        """CSV of net pay per employee for upload to the bank (approved or paid runs only)."""
        import csv
        from django.http import HttpResponse

        payroll_run = self.get_object()
        if payroll_run.status not in (PayrollRun.Status.APPROVED, PayrollRun.Status.PAID):
            return Response({'error': 'Only approved runs can be exported for payment.'}, status=400)
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="payroll_{payroll_run.period_end:%Y%m}_bank.csv"'
        writer = csv.writer(response)
        writer.writerow(['employee_number', 'name', 'bank_name', 'branch_code', 'account_number', 'amount',
                         'currency', 'reference'])
        currency = payroll_run.currency.code if payroll_run.currency else 'USD'
        missing = []
        for slip in payroll_run.payslips.select_related('employee').order_by('employee__employee_number'):
            emp = slip.employee
            if not emp.bank_account_number:
                missing.append(emp.employee_number)
            writer.writerow([emp.employee_number, emp.full_name, emp.bank_name, emp.bank_branch_code,
                             emp.bank_account_number, f'{slip.net_amount:.2f}', currency,
                             f'SALARY {payroll_run.period_end:%b %Y}'.upper()])
        if missing:
            response['X-Missing-Bank-Details'] = ','.join(missing)
        return response

    @action(detail=True, methods=['post'])
    def email_payslips(self, request, pk=None):
        """Email each employee their payslip PDF. Returns who was sent and who was skipped."""
        from django.core.mail import EmailMessage
        from apps.finance.services.pdf_service import generate_payslip_pdf

        payroll_run = self.get_object()
        if payroll_run.status not in (PayrollRun.Status.APPROVED, PayrollRun.Status.PAID):
            return Response({'error': 'Payslips are sent once the run is approved.'}, status=400)
        sent, skipped = [], []
        for slip in payroll_run.payslips.select_related('employee', 'payroll_run').prefetch_related('lines'):
            emp = slip.employee
            if not emp.email:
                skipped.append(emp.employee_number)
                continue
            message = EmailMessage(subject=f'Payslip - {payroll_run.name}',
                                   body=f'Dear {emp.first_name},\n\nYour payslip for {payroll_run.name} is attached.\n',
                                   to=[emp.email])
            message.attach(f'Payslip_{emp.employee_number}.pdf', generate_payslip_pdf(slip), 'application/pdf')
            message.send()
            sent.append(emp.employee_number)
        return Response({'sent': sent, 'skipped_no_email': skipped})


class PayslipViewSet(RecordRulesMixin, viewsets.ModelViewSet):
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
    filterset_fields = ['currency']

class PayrollSettingViewSet(viewsets.ModelViewSet):
    queryset = PayrollSetting.objects.all()
    serializer_class = PayrollSettingSerializer

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
