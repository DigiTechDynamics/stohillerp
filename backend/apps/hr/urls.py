from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('employees', views.EmployeeViewSet, basename='employees')
router.register('departments', views.DepartmentViewSet, basename='departments')
router.register('leave', views.LeaveRequestViewSet, basename='leave')
router.register('allocations', views.LeaveAllocationViewSet, basename='leave-allocations')
router.register('contracts', views.EmployeeContractViewSet, basename='contracts')
router.register('attendance', views.AttendanceViewSet, basename='attendance')
router.register('job-positions', views.JobPositionViewSet, basename='job-positions')

urlpatterns = [path('', include(router.urls))]
