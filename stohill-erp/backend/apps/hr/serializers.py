"""Stohil Properties - HR Serializers"""
from rest_framework import serializers
from apps.hr.models import Employee, Department, LeaveRequest

class DepartmentSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(source='manager.full_name', read_only=True)
    class Meta:
        model = Department
        fields = '__all__'

class EmployeeSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    department_name = serializers.CharField(source='department.name', read_only=True)
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
