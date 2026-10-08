"""Stohil Properties - HR Serializers"""
from rest_framework import serializers

from utils.serializers import SensitiveFieldsMixin
from apps.hr.models import Employee, Department, JobPosition, LeaveRequest, LeaveAllocation, Attendance, EmployeeContract

class DepartmentSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(source='manager.full_name', read_only=True)
    class Meta:
        model = Department
        fields = '__all__'

class EmployeeSerializer(SensitiveFieldsMixin, serializers.ModelSerializer):
    # Other modules use employees as agent pickers; personal data stays in HR/payroll.
    sensitive_fields = ('id_number', 'bank_name', 'notes')
    sensitive_modules = {'hr', 'payroll', 'agents'}

    full_name = serializers.ReadOnlyField()
    department_name = serializers.CharField(source='department.name', read_only=True)
    job_position_name = serializers.CharField(source='job_position.name', read_only=True)
    manager_name = serializers.CharField(source='reports_to.full_name', read_only=True)
    class Meta:
        model = Employee
        fields = '__all__'
        read_only_fields = ['employee_number']
        extra_kwargs = {
            'bank_account_number': {'write_only': True},
            'bank_branch_code': {'write_only': True}
        }

class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    leave_type_display = serializers.CharField(source='get_leave_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.full_name', read_only=True)
    class Meta:
        model = LeaveRequest
        fields = '__all__'

class JobPositionSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    class Meta:
        model = JobPosition
        fields = '__all__'

class EmployeeContractSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    job_position_name = serializers.CharField(source='job_position.name', read_only=True)
    class Meta:
        model = EmployeeContract
        fields = '__all__'

class AttendanceSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)

    class Meta:
        model = Attendance
        fields = '__all__'
        read_only_fields = ['worked_hours']

    def validate(self, attrs):
        check_in = attrs.get('check_in', getattr(self.instance, 'check_in', None))
        check_out = attrs.get('check_out', getattr(self.instance, 'check_out', None))
        if check_in and check_out and check_out <= check_in:
            raise serializers.ValidationError({'check_out': 'Check-out must be after check-in.'})
        return attrs

class LeaveAllocationSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    leave_type_display = serializers.CharField(source='get_leave_type_display', read_only=True)
    days_taken = serializers.SerializerMethodField()
    days_remaining = serializers.SerializerMethodField()

    class Meta:
        model = LeaveAllocation
        fields = '__all__'

    def validate_days_allocated(self, value):
        if value < 0:
            raise serializers.ValidationError('Days allocated cannot be negative.')
        return value

    def get_days_taken(self, obj):
        """Approved leave of this type starting within the allocation's validity."""
        from django.db.models import Sum

        from apps.hr.models import LeaveRequest

        taken = LeaveRequest.objects.filter(employee_id=obj.employee_id, leave_type=obj.leave_type,
                                            status=LeaveRequest.LeaveStatus.APPROVED)
        if obj.valid_from:
            taken = taken.filter(start_date__gte=obj.valid_from)
        if obj.valid_to:
            taken = taken.filter(start_date__lte=obj.valid_to)
        return taken.aggregate(t=Sum('days_requested'))['t'] or 0

    def get_days_remaining(self, obj):
        return obj.days_allocated - self.get_days_taken(obj)
