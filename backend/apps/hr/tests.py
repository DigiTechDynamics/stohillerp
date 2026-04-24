from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from apps.core.models import User, Role, Module
from apps.hr.models import Employee, Department
import uuid

class EmployeePermissionTests(APITestCase):
    def setUp(self):
        # Create Modules
        self.hr_module = Module.objects.create(name='HR', code='hr')
        
        # Create Roles
        self.admin_role = Role.objects.create(name='Admin', role_type=Role.RoleType.ADMIN)
        self.admin_role.modules.add(self.hr_module)
        
        self.hr_manager_role = Role.objects.create(name='HR Manager', role_type=Role.RoleType.HR_MANAGER)
        self.hr_manager_role.modules.add(self.hr_module)
        
        self.agent_role = Role.objects.create(name='Agent', role_type=Role.RoleType.AGENT)
        self.agent_role.modules.add(self.hr_module) # Can see HR but shouldn't edit
        
        # Create Users
        self.admin_user = User.objects.create_user(
            email='admin@stohill.com', password='password123', first_name='Admin', last_name='User'
        )
        self.admin_user.roles.add(self.admin_role)
        self.admin_user.is_staff = True
        self.admin_user.save()
        
        self.hr_user = User.objects.create_user(
            email='hr@stohill.com', password='password123', first_name='HR', last_name='Manager'
        )
        self.hr_user.roles.add(self.hr_manager_role)
        self.hr_user.save()
        
        self.agent_user = User.objects.create_user(
            email='agent@stohill.com', password='password123', first_name='Agent', last_name='User'
        )
        self.agent_user.roles.add(self.agent_role)
        self.agent_user.save()
        
        # Create data
        self.dept = Department.objects.create(name='Operations', code='OPS')
        from django.utils import timezone
        self.employee = Employee.objects.create(
            first_name='John',
            last_name='Doe',
            email='john@doe.com',
            employee_number='EMP001',
            department=self.dept,
            start_date=timezone.now().date()
        )
        
        self.list_url = reverse('employees-list')
        self.detail_url = reverse('employees-detail', args=[self.employee.id])

    def test_admin_can_crud_employee(self):
        self.client.force_authenticate(user=self.admin_user)
        
        # List
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Update
        response = self.client.patch(self.detail_url, {'first_name': 'Johnny'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.employee.refresh_from_db()
        self.assertEqual(self.employee.first_name, 'Johnny')
        
        # Delete
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Employee.objects.count(), 0)

    def test_hr_manager_can_crud_employee(self):
        self.client.force_authenticate(user=self.hr_user)
        
        # List
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Update
        response = self.client.patch(self.detail_url, {'first_name': 'Johnny'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Delete
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_agent_cannot_crud_employee(self):
        self.client.force_authenticate(user=self.agent_user)
        
        # List (restricted by our new permission)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Update
        response = self.client.patch(self.detail_url, {'first_name': 'Johnny'})
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        
        # Delete
        response = self.client.delete(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
