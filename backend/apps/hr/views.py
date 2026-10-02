"""Stohil Properties - HR Views"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from decimal import Decimal
from django_filters.rest_framework import DjangoFilterBackend
from apps.hr.models import Employee, Department, LeaveRequest, JobPosition, EmployeeContract, Attendance, LeaveAllocation
from utils.record_rules import RecordRulesMixin

class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.select_related('department', 'reports_to')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'employment_type', 'department']
    search_fields = ['first_name', 'last_name', 'employee_number', 'email']
    ordering_fields = ['first_name', 'last_name', 'employee_number', 'created_at']
    def get_serializer_class(self):
        from apps.hr.serializers import EmployeeSerializer
        return EmployeeSerializer

    @action(detail=True, methods=['get'])
    def statement(self, request, pk=None):
        employee = self.get_object()
        from apps.payroll.models import Payslip
        
        items = Payslip.objects.filter(
            employee=employee, 
            status__in=['paid', 'done']
        ).select_related('payroll_run', 'payroll_run__currency').order_by('-payroll_run__period_end')
        
        history = []
        total_earnings = Decimal('0.00')
        total_deductions = Decimal('0.00')
        total_net = Decimal('0.00')
        
        for item in items:
            run = item.payroll_run
            currency = run.currency.code if run.currency else "USD"
            
            # Since Payslip fields don't have direct gross/deduction columns, we can calculate from lines
            # For simplicity in this endpoint we can just use net_amount. 
            # Or we can aggregate the lines. Let's aggregate lines.
            gross = sum(line.amount for line in item.lines.all() if line.category in ['basic', 'allowance'])
            deductions = sum(line.amount for line in item.lines.all() if line.category == 'deduction')

            history.append({
                'id': item.id,
                'period': f"{run.period_start} to {run.period_end}",
                'run_name': run.name,
                'date': run.processed_at,
                'currency': currency,
                'gross': gross,
                'deductions': deductions,
                'net': item.net_amount,
                'status': item.status,
                'reference': item.payment_reference
            })
            
            total_earnings += gross
            total_deductions += deductions
            total_net += item.net_amount
            
        return Response({
            'employee': {
                'id': employee.id,
                'name': employee.full_name,
                'number': employee.employee_number
            },
            'summary': {
                'total_earnings': total_earnings,
                'total_deductions': total_deductions,
                'total_net': total_net
            },
            'history': history
        })


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name']
    def get_serializer_class(self):
        from apps.hr.serializers import DepartmentSerializer
        return DepartmentSerializer

class LeaveRequestViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = LeaveRequest.objects.select_related('employee')
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['status', 'leave_type', 'employee']
    ordering_fields = ['start_date', 'created_at']
    def get_serializer_class(self):
        from apps.hr.serializers import LeaveRequestSerializer
        return LeaveRequestSerializer

    def perform_update(self, serializer):
        instance = serializer.save()
        if instance.status == 'approved':
            instance.employee.status = 'on_leave'
            instance.employee.save(update_fields=['status'])


class JobPositionViewSet(viewsets.ModelViewSet):
    queryset = JobPosition.objects.select_related('department')
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['department']
    search_fields = ['name']
    def get_serializer_class(self):
        from apps.hr.serializers import JobPositionSerializer
        return JobPositionSerializer


class EmployeeContractViewSet(viewsets.ModelViewSet):
    queryset = EmployeeContract.objects.select_related('employee', 'job_position', 'department')
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['employee', 'status']
    ordering_fields = ['start_date']
    def get_serializer_class(self):
        from apps.hr.serializers import EmployeeContractSerializer
        return EmployeeContractSerializer


class AttendanceViewSet(viewsets.ModelViewSet):
    queryset = Attendance.objects.select_related('employee')
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['employee']
    ordering_fields = ['check_in']
    def get_serializer_class(self):
        from apps.hr.serializers import AttendanceSerializer
        return AttendanceSerializer


class LeaveAllocationViewSet(viewsets.ModelViewSet):
    queryset = LeaveAllocation.objects.select_related('employee')
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['employee', 'leave_type']
    def get_serializer_class(self):
        from apps.hr.serializers import LeaveAllocationSerializer
        return LeaveAllocationSerializer

