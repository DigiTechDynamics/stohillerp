from django.contrib import admin
from .models import Employee, Department, JobPosition, LeaveRequest, LeaveAllocation, Attendance, EmployeeContract

@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'manager')
    search_fields = ('code', 'name')

@admin.register(JobPosition)
class JobPositionAdmin(admin.ModelAdmin):
    list_display = ('name', 'department', 'expected_employees')
    search_fields = ('name',)

@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ('employee_number', 'first_name', 'last_name', 'job_position', 'status')
    list_filter = ('status', 'employment_type')
    search_fields = ('employee_number', 'first_name', 'last_name', 'email')

@admin.register(LeaveRequest)
class LeaveRequestAdmin(admin.ModelAdmin):
    list_display = ('employee', 'leave_type', 'start_date', 'end_date', 'status')
    list_filter = ('status', 'leave_type')

@admin.register(LeaveAllocation)
class LeaveAllocationAdmin(admin.ModelAdmin):
    list_display = ('employee', 'leave_type', 'days_allocated', 'valid_from', 'valid_to')
    list_filter = ('leave_type',)

@admin.register(Attendance)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ('employee', 'check_in', 'check_out', 'worked_hours')
    list_filter = ('check_in',)

@admin.register(EmployeeContract)
class EmployeeContractAdmin(admin.ModelAdmin):
    list_display = ('employee', 'job_position', 'start_date', 'status', 'wage')
    list_filter = ('status',)
