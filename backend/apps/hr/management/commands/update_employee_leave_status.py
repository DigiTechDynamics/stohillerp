from django.core.management.base import BaseCommand
from django.utils import timezone
from apps.hr.models import Employee, LeaveRequest

class Command(BaseCommand):
    help = 'Reverts employee status to active after their approved leave has ended'

    def handle(self, *args, **options):
        today = timezone.now().date()
        
        on_leave_employees = Employee.objects.filter(status=Employee.EmployeeStatus.ON_LEAVE)
        
        updated_count = 0
        for employee in on_leave_employees:
            active_leaves = LeaveRequest.objects.filter(
                employee=employee,
                status=LeaveRequest.LeaveStatus.APPROVED,
                start_date__lte=today,
                end_date__gte=today
            )
            
            if not active_leaves.exists():
                employee.status = Employee.EmployeeStatus.ACTIVE
                employee.save(update_fields=['status'])
                updated_count += 1
                
        self.stdout.write(self.style.SUCCESS(f'Successfully reverted {updated_count} employees to active status.'))
