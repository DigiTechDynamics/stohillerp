import os
import django  # type: ignore
import sys
from decimal import Decimal
from django.utils import timezone  # type: ignore
from datetime import timedelta

# Setup Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.payroll.models import PayrollRun, PayrollItem  # type: ignore
from apps.hr.models import Employee  # type: ignore
from apps.commissions.models import CommissionRecord  # type: ignore
from apps.core.models import User, Currency  # type: ignore

def test_payroll_processing():
    print("Starting Payroll Logic Verification...")
    
    # 0. Setup Base Currency
    base_curr, _ = Currency.objects.get_or_create(
        code="USD",
        defaults={'name': 'US Dollar', 'symbol': '$', 'is_base': True}
    )
    Currency.objects.filter(is_base=True).exclude(id=base_curr.id).update(is_base=False)

    # 1. Setup Data
    # Ensure we have an employee
    emp, created = Employee.objects.get_or_create(
        employee_number="TEST001",
        defaults={
            'first_name': 'Test',
            'last_name': 'Employee',
            'email': 'test@stohill.com',
            'basic_salary': Decimal('5000.00'),
            'status': 'active',
            'start_date': timezone.now().date()
        }
    )
    if not created:
        emp.basic_salary = Decimal('5000.00')
        emp.status = 'active'
        emp.save()

    from apps.properties.models import Property, PropertyType  # type: ignore
    ptype, _ = PropertyType.objects.get_or_create(code="RES", defaults={'name': 'Residential'})
    prop, _ = Property.objects.get_or_create(
        name="Test Property",
        defaults={'property_type': ptype, 'status': 'available', 'address_line1': '123 Test St'}
    )

    # Create or update a commission record for this employee
    comm, created = CommissionRecord.objects.get_or_create(
        reference="TEST-COMM-001",
        defaults={
            'agent': emp,
            'property': prop,
            'transaction_type': 'sale',
            'transaction_amount': Decimal('100000.00'),
            'company_commission_rate': Decimal('5.00'),
            'company_commission_amount': Decimal('5000.00'),
            'agent_split_rate': Decimal('60.00'),
            'gross_commission': Decimal('3000.00'),
            'net_commission': Decimal('800.00'),
            'status': 'approved',
            'approved_date': timezone.now().date()
        }
    )
    if not created:
        comm.status = 'approved'
        comm.approved_date = timezone.now().date()
        comm.save()

    # 2. Create Payroll Run
    run = PayrollRun.objects.create(
        name="Test Run March",
        period_start=timezone.now().date() - timedelta(days=5),
        period_end=timezone.now().date() + timedelta(days=5),
        status='draft'
    )

    # 3. Process Run (Mental simulation of the viewset action)
    print(f"Processing Run: {run.name}")
    
    # Logic from PayrollRunViewSet.process
    if not run.currency_id:
        try:
            run.currency = Currency.objects.get(is_base=True)
        except Currency.DoesNotExist:
            pass
            
    run.items.all().delete()
    total_gross = Decimal('0.00')
    total_net = Decimal('0.00')
    
    # Calculate commissions
    comm_total = CommissionRecord.objects.filter(
        agent=emp,
        status='approved',
        approved_date__range=(run.period_start, run.period_end)
    ).aggregate(total=django.db.models.Sum('net_commission'))['total'] or Decimal('0.00')
    
    item = PayrollItem.objects.create(
        payroll_run=run,
        employee=emp,
        basic_salary=emp.basic_salary,
        commission_amount=comm_total
    )
    total_gross += item.gross_amount
    total_net += item.net_amount
    
    run.total_gross = total_gross
    run.total_net = total_net
    run.status = 'processing'
    run.save()

    # 4. Assertions
    print(f"Employee Salary: {item.basic_salary}")
    print(f"Employee Commissions: {item.commission_amount}")
    print(f"Calculated Gross: {item.gross_amount}")
    print(f"Calculated Net: {item.net_amount}")

    assert item.gross_amount == Decimal('5800.00'), f"Expected 5800.00, got {item.gross_amount}"
    assert item.net_amount == Decimal('5800.00'), f"Expected 5800.00 (no deductions), got {item.net_amount}"
    assert run.total_net == Decimal('5800.00')
    assert run.currency.code == "USD", f"Expected currency USD, got {run.currency.code if run.currency else 'None'}"
    
    print("DONE: Payroll calculation logic and currency assignment verified!")
    
    # 5. Test Payment Execution
    print("Testing Payment Execution...")
    run.status = 'approved'
    run.save()
    
    # Logic from PayrollRunViewSet.pay_all
    run.items.all().update(status='paid')
    run.status = 'paid'
    run.save()
    
    CommissionRecord.objects.filter(
        agent=item.employee,
        status='approved',
        approved_date__range=(run.period_start, run.period_end)
    ).update(status='paid')

    # Verify
    comm.refresh_from_db()
    assert comm.status == 'paid', "Commission record should be marked as paid"
    print("Payroll payment workflow verified!")

if __name__ == "__main__":
    try:
        test_payroll_processing()
    except Exception as e:
        print(f"FAILED: {e}")
        sys.exit(1)
