"""Stohil Properties - HR Serializers"""
from decimal import Decimal

from rest_framework import serializers

from utils.serializers import SensitiveFieldsMixin
from apps.hr.models import Employee, Department, JobPosition, LeaveRequest, LeaveAllocation, Attendance, EmployeeContract

class DepartmentSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(source='manager.full_name', read_only=True)
    employee_count = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = '__all__'

    def get_employee_count(self, obj):
        count = getattr(obj, 'staff_count', None)          # annotated on lists
        return obj.employee_set.count() if count is None else count

    def validate_manager(self, manager):
        if manager and not manager.is_manager:
            raise serializers.ValidationError(
                f'{manager.full_name} has no manager profile. Tick "Manager profile" on their employee record first.')
        return manager

class EmployeeSerializer(SensitiveFieldsMixin, serializers.ModelSerializer):
    # Other modules use employees as agent pickers; personal data stays in HR/payroll.
    sensitive_fields = ('id_number', 'bank_name', 'notes')
    sensitive_modules = {'hr', 'payroll', 'agents'}

    full_name = serializers.ReadOnlyField()
    department_name = serializers.CharField(source='department.name', read_only=True)
    job_position_name = serializers.CharField(source='job_position.name', read_only=True)
    manager_name = serializers.CharField(source='reports_to.full_name', read_only=True)
    staff_type_display = serializers.CharField(source='get_staff_type_display', read_only=True)
    managed_departments = serializers.SerializerMethodField()

    class Meta:
        model = Employee
        fields = '__all__'
        # Reporting lines come from the department's manager.
        read_only_fields = ['employee_number', 'reports_to']
        extra_kwargs = {
            'bank_account_number': {'write_only': True},
            'bank_branch_code': {'write_only': True}
        }

    def get_managed_departments(self, obj):
        return [d.name for d in obj.managed_department.all()]

    def validate(self, attrs):
        if self.instance and attrs.get('is_manager') is False and self.instance.managed_department.exists():
            names = ', '.join(d.name for d in self.instance.managed_department.all())
            raise serializers.ValidationError({'is_manager': f'{self.instance.full_name} manages {names}. '
                                                             'Choose another manager for it first.'})
        return attrs

class LeaveRequestSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source='employee.full_name', read_only=True)
    leave_type_display = serializers.CharField(source='get_leave_type_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.full_name', read_only=True)

    class Meta:
        model = LeaveRequest
        fields = '__all__'
        extra_kwargs = {'end_date': {'required': False}}

    def validate(self, attrs):
        """The start date and days applied decide the end date; then check overlaps and the balance."""
        from apps.hr.leave import balance_for, end_date_for, is_working_day, working_days

        keys = ('employee', 'leave_type', 'start_date', 'end_date', 'days_requested')
        if self.instance and not any(k in attrs for k in keys):
            return attrs                                   # approve / reject only

        def get(key):
            return attrs.get(key, getattr(self.instance, key, None))

        employee, leave_type, start, days = get('employee'), get('leave_type'), get('start_date'), get('days_requested')
        if not start:
            raise serializers.ValidationError({'start_date': 'Give the first day of leave.'})
        if days is None or days <= 0:
            raise serializers.ValidationError({'days_requested': 'Give the number of days applied for.'})
        if days * 2 != int(days * 2):
            raise serializers.ValidationError({'days_requested': 'Leave is taken in whole or half days.'})
        if not is_working_day(start):
            raise serializers.ValidationError({'start_date': 'Leave must start on a working day (Monday to Friday).'})

        expected_end = end_date_for(start, days)
        end = attrs.get('end_date')
        if end is None:
            end = expected_end
        elif end < start:
            raise serializers.ValidationError({'end_date': 'The end date is before the start date.'})
        elif working_days(start, end) != working_days(start, expected_end):
            raise serializers.ValidationError({'end_date': (
                f'{days} working days from {start:%d %b %Y} end on {expected_end:%a %d %b %Y}, '
                f'but {start:%d %b} to {end:%d %b} is {working_days(start, end)} working days.')})
        attrs['end_date'] = end

        others = LeaveRequest.objects.filter(employee=employee, status__in=['pending', 'approved'],
                                             start_date__lte=end, end_date__gte=start)
        if self.instance:
            others = others.exclude(pk=self.instance.pk)
        clash = others.first()
        if clash:
            raise serializers.ValidationError({'start_date': (
                f'{employee.full_name} already has {clash.get_status_display().lower()} leave from '
                f'{clash.start_date:%d %b} to {clash.end_date:%d %b %Y}.')})

        if leave_type != LeaveRequest.LeaveType.UNPAID:
            balance = balance_for(employee, leave_type, on=start, exclude=getattr(self.instance, 'pk', None))
            if balance['available'] is not None and days > balance['available']:
                n = lambda d: f'{Decimal(d).normalize():f}'          # 4.0 -> 4, 20 -> 20
                raise serializers.ValidationError({'days_requested': (
                    f'{employee.full_name} has only {n(max(balance["available"], 0))} {balance["label"].lower()} '
                    f'days available on {start:%d %b %Y} ({n(balance["entitled"])} due, {n(balance["taken"])} '
                    f'taken, {n(balance["pending"])} awaiting approval).')})
        return attrs

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
