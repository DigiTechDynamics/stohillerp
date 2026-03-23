"""Stohil Properties - HR Views"""
from rest_framework import viewsets, filters
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from apps.hr.models import Employee, Department, LeaveRequest

class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.select_related('department', 'reports_to')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'employment_type', 'department']
    search_fields = ['first_name', 'last_name', 'employee_number', 'email']
    ordering_fields = ['first_name', 'last_name', 'employee_number', 'created_at']
    def get_serializer_class(self):
        from apps.hr.serializers import EmployeeSerializer
        return EmployeeSerializer

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name']
    def get_serializer_class(self):
        from apps.hr.serializers import DepartmentSerializer
        return DepartmentSerializer

class LeaveRequestViewSet(viewsets.ModelViewSet):
    queryset = LeaveRequest.objects.select_related('employee')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['status', 'leave_type', 'employee']
    ordering_fields = ['start_date', 'created_at']
    def get_serializer_class(self):
        from apps.hr.serializers import LeaveRequestSerializer
        return LeaveRequestSerializer
