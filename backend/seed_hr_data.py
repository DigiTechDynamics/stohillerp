import os
import django
import sys
import random
from datetime import date, timedelta
from decimal import Decimal

# Setup Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.hr.models import Department, JobPosition, Employee, EmployeeContract
from apps.core.services.number_sequence import NumberSequenceService

def seed_hr_data():
    print("Seeding dummy HR data...")

    # 1. Departments
    dept_names = ['Sales', 'IT Support', 'Human Resources', 'Finance', 'Property Management']
    departments = []
    
    for idx, name in enumerate(dept_names):
        code = name[:3].upper() + str(idx+1)
        dept, _ = Department.objects.get_or_create(
            name=name, 
            defaults={'code': code}
        )
        departments.append(dept)
    print(f"Created {len(departments)} departments.")

    # 2. Job Positions
    positions_data = [
        ("Sales Associate", departments[0], 2),
        ("Senior Sales Manager", departments[0], 1),
        ("IT Administrator", departments[1], 1),
        ("Software Developer", departments[1], 1),
        ("HR Generalist", departments[2], 1),
        ("Accountant", departments[3], 2),
        ("Property Manager", departments[4], 2),
    ]
    
    positions = []
    for title, dept, count in positions_data:
        pos, _ = JobPosition.objects.get_or_create(
            name=title,
            department=dept,
            defaults={'expected_employees': count}
        )
        positions.append(pos)
    print("Created Job Positions.")

    # 3. Employees
    employee_data = [
        ("John", "Doe", positions[0]),
        ("Jane", "Smith", positions[1]),
        ("Alice", "Johnson", positions[2]),
        ("Bob", "Williams", positions[3]),
        ("Charlie", "Brown", positions[4]),
        ("Diana", "Davis", positions[5]),
        ("Eve", "Miller", positions[5]),
        ("Frank", "Wilson", positions[6]),
        ("Grace", "Moore", positions[6]),
        ("Hank", "Taylor", positions[0]),
    ]
    
    base_start_date = date(2025, 1, 1)

    for idx, (first, last, pos) in enumerate(employee_data):
        email = f"{first.lower()}.{last.lower()}@stohill.co.za"
        emp_number = f"EMP-90{idx+1:02d}"
        
        emp, created = Employee.objects.get_or_create(
            email=email,
            defaults={
                'employee_number': emp_number,
                'first_name': first,
                'last_name': last,
                'department': pos.department,
                'job_position': pos,
                'start_date': base_start_date + timedelta(days=idx * 5),
                'phone': f"08{random.randint(10000000, 99999999)}",
                'employment_type': 'full_time',
                'status': 'active'
            }
        )
        
        if created:
            # Create a running contract
            wage = Decimal(random.randint(1000, 5000))
            EmployeeContract.objects.create(
                employee=emp,
                job_position=pos,
                department=pos.department,
                start_date=emp.start_date,
                wage=wage,
                status='running'
            )
            print(f"Created employee: {emp.full_name} with wage ${wage}")

    print("Success: HR data dynamically generated.")

if __name__ == "__main__":
    seed_hr_data()
