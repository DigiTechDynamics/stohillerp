import os
import django
import sys
from decimal import Decimal
from django.utils import timezone
from django.test import RequestFactory

# Setup Django
sys.path.append(os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.payroll.models import PayrollRun, Payslip, PayslipLine
from apps.payroll.views import PayrollRunViewSet
from apps.core.models import User, Currency
from apps.finance.models.core import ChartOfAccount

def verify_payroll():
    # Ensure a basic COA exists for the integration
    usd, _ = Currency.objects.get_or_create(code='USD', defaults={'name': 'US Dollar', 'symbol': '$'})
    payable_acc, _ = ChartOfAccount.objects.get_or_create(
        code='2100', 
        defaults={'name': 'Accounts Payable', 'account_type': 'liability', 'account_sub_type': 'payable'}
    )
    expense_acc, _ = ChartOfAccount.objects.get_or_create(
        code='5900', 
        defaults={'name': 'Wages and Salaries', 'account_type': 'expense'}
    )

    run = PayrollRun.objects.filter(status='draft').first()
    if not run:
        print("No draft run found, creating one...")
        run = PayrollRun.objects.create(
            name='Test March 2026', 
            period_start='2026-03-01', 
            period_end='2026-03-31', 
            status='draft'
        )
    
    print(f"Processing Run: {run.id} - {run.name}")
    
    from rest_framework.request import Request
    from django.test import RequestFactory
    
    # Simulate a request
    factory = RequestFactory()
    django_request = factory.post(f'/api/payroll/runs/{run.id}/process/')
    user = User.objects.filter(is_superuser=True).first()
    django_request.user = user
    
    # Call the process method directly on the viewset instance
    viewset = PayrollRunViewSet()
    viewset.request = Request(django_request)
    viewset.kwargs = {'pk': run.id}
    
    response = viewset.process(django_request, pk=run.id)
    
    print(f"Response Status: {response.status_code}")
    if response.status_code != 200:
        print(f"Error: {response.data}")
        return

    run.refresh_from_db()
    print(f"Run Status: {run.status}")
    print(f"Payslips Created: {run.payslips.count()}")
    
    for p in run.payslips.all():
        print(f"\nPayslip for {p.employee.full_name}:")
        print(f"  Gross: {p.payroll_run.total_gross} (Run Total)")
        print(f"  Net: {p.net_amount}")
        print("  Lines:")
        for l in p.lines.all():
            print(f"    - {l.code} ({l.name}): {l.amount}")

if __name__ == "__main__":
    verify_payroll()
