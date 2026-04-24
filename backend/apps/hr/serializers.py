"""Stohil Properties - HR Serializers"""
from rest_framework import serializers
from apps.hr.models import Employee, Department, JobPosition, LeaveRequest, LeaveAllocation, Attendance, EmployeeContract

class DepartmentSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(source='manager.full_name', read_only=True)
    class Meta:
        model = Department
        fields = '__all__'

class EmployeeSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    department_name = serializers.CharField(source='department.name', read_only=True)
    job_position_name = serializers.CharField(source='job_position.name', read_only=True)
    manager_name = serializers.CharField(source='reports_to.full_name', read_only=True)
    
    additional_departments_names = serializers.SerializerMethodField()
    additional_positions_names = serializers.SerializerMethodField()

    # Explicitly define date fields to handle various input formats from frontend pickers
    start_date = serializers.DateField(input_formats=['%Y-%m-%d', '%Y/%m/%d', 'iso-8601'])
    end_date = serializers.DateField(input_formats=['%Y-%m-%d', '%Y/%m/%d', 'iso-8601'], required=False, allow_null=True)
    fidelity_fund_expiry = serializers.DateField(input_formats=['%Y-%m-%d', '%Y/%m/%d', 'iso-8601'], required=False, allow_null=True)

    class Meta:
        model = Employee
        fields = '__all__'
        read_only_fields = ['employee_number']
        extra_kwargs = {
            'bank_account_number': {'write_only': True},
            'bank_branch_code': {'write_only': True}
        }

    def get_additional_departments_names(self, obj):
        return [d.name for d in obj.additional_departments.all()]

    def get_additional_positions_names(self, obj):
        return [p.name for p in obj.additional_positions.all()]

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

class LeaveAllocationSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    leave_type_display = serializers.CharField(source='get_leave_type_display', read_only=True)
    class Meta:
        model = LeaveAllocation
        fields = '__all__'
