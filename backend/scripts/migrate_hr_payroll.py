import os
import sys
import django
from decimal import Decimal
import django.utils.timezone as timezone

# Add backend directory to sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.development')
django.setup()

from apps.hr.models import Employee, JobPosition, EmployeeContract
from apps.payroll.models import PayrollItem, SalaryRule, SalaryStructure, Payslip, PayslipLine

def migrate_data():
    print("Starting HR and Payroll Data Migration...")

    # 1. Migrate Job Positions and Employee Contracts
    employees = Employee.objects.all()
    print(f"Migrating {employees.count()} employees...")

    # Unique job titles
    job_titles = set(employees.values_list('job_title', flat=True))
    positions_map = {}
    
    for title in job_titles:
        if not title:
            continue
        pos, created = JobPosition.objects.get_or_create(
            name=title,
            defaults={'expected_employees': 1}
        )
        positions_map[title] = pos

    for emp in employees:
        if emp.job_title:
            emp.job_position_fk = positions_map.get(emp.job_title)
            emp.save(update_fields=['job_position_fk'])
            
        # Create Contract
        contract, created = EmployeeContract.objects.get_or_create(
            employee=emp,
            defaults={
                'job_position': emp.job_position_fk,
                'department': emp.department,
                'start_date': emp.start_date or timezone.now().date(),
                'wage': emp.basic_salary,
                'status': 'running'
            }
        )
    print("HR migration complete.")

    # 2. Set up Salary Rules
    print("Setting up Salary Rules...")
    rules_data = [
        {'name': 'Basic Salary', 'code': 'BASIC', 'category': 'basic', 'seq': 10},
        {'name': 'Commission', 'code': 'COMM', 'category': 'allowance', 'seq': 20},
        {'name': 'Bonus', 'code': 'BONUS', 'category': 'allowance', 'seq': 30},
        {'name': 'PAYE', 'code': 'PAYE', 'category': 'deduction', 'seq': 40},
        {'name': 'AIDS Levy', 'code': 'AIDS', 'category': 'deduction', 'seq': 50},
        {'name': 'NSSA', 'code': 'NSSA', 'category': 'deduction', 'seq': 60},
        {'name': 'Other Deductions', 'code': 'OTHER_DED', 'category': 'deduction', 'seq': 70},
        {'name': 'Net Pay', 'code': 'NET', 'category': 'net', 'seq': 100},
    ]

    rules = {}
    for r in rules_data:
        rule, created = SalaryRule.objects.get_or_create(
            code=r['code'],
            defaults={
                'name': r['name'],
                'category': r['category'],
                'sequence': r['seq'],
            }
        )
        rules[r['code']] = rule

    structure, created = SalaryStructure.objects.get_or_create(
        code='ZW_STD',
        defaults={'name': 'Zimbabwe Standard Structure'}
    )
    if created:
        structure.rules.set(rules.values())

    # 3. Migrate Payroll Items to Payslips
    payroll_items = PayrollItem.objects.all()
    print(f"Migrating {payroll_items.count()} payroll items to Payslips...")

    for item in payroll_items:
        contract = EmployeeContract.objects.filter(employee=item.employee).first()
        
        status_map = {
            'pending': 'draft',
            'paid': 'paid',
            'void': 'cancelled'
        }
        
        payslip = Payslip.objects.create(
            payroll_run=item.payroll_run,
            employee=item.employee,
            contract=contract,
            structure=structure,
            date_from=item.payroll_run.period_start,
            date_to=item.payroll_run.period_end,
            status=status_map.get(item.status, 'draft'),
            net_amount=item.net_amount,
            payment_reference=item.payment_reference,
            created_at=item.created_at
        )

        def create_line(code, amount):
            if amount > 0:
                PayslipLine.objects.create(
                    payslip=payslip,
                    salary_rule=rules[code],
                    name=rules[code].name,
                    code=rules[code].code,
                    category=rules[code].category,
                    amount=amount,
                    total=amount
                )

        create_line('BASIC', item.basic_salary)
        create_line('COMM', item.commission_amount)
        create_line('BONUS', item.bonus)
        create_line('PAYE', item.tax_amount)
        create_line('AIDS', item.aids_levy)
        create_line('NSSA', item.nssa_deduction)
        create_line('OTHER_DED', item.other_deductions)
        create_line('NET', item.net_amount)

    print("Payroll migration complete. Success!")

if __name__ == '__main__':
    migrate_data()
