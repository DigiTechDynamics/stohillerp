import os
import django
from decimal import Decimal
from datetime import date
from django.utils import timezone

# Setup Django Environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.apps import apps
Opportunity = apps.get_model('crm', 'Opportunity')
Pipeline = apps.get_model('crm', 'Pipeline')
PipelineStage = apps.get_model('crm', 'PipelineStage')
Contact = apps.get_model('crm', 'Contact')
Currency = apps.get_model('core', 'Currency')
Employee = apps.get_model('hr', 'Employee')
Department = apps.get_model('hr', 'Department')
Property = apps.get_model('properties', 'Property')
PropertyType = apps.get_model('properties', 'PropertyType')
SaleTransaction = apps.get_model('sales', 'SaleTransaction')
User = apps.get_model('core', 'User')

def get_dashboard_data():
    from apps.dashboard.views import ExecutiveDashboardView
    from rest_framework.test import APIRequestFactory
    
    admin_user = User.objects.filter(is_superuser=True).first()
    factory = APIRequestFactory()
    request = factory.get('/api/v1/dashboard/executive/')
    django.contrib.auth.models.AnonymousUser = User # Mock
    request.user = admin_user
    
    view = ExecutiveDashboardView.as_view()
    try:
        response = view(request)
        return response.data
    except Exception:
        import traceback
        print(traceback.format_exc())
        raise

def verify():
    print("--- Starting CRM-to-Finance Lifecycle Verification ---")
    admin_user = User.objects.filter(is_superuser=True).first()

    # Ensure journals/accounts exist FIRST (as dashboard depends on them)
    print("Ensuring required GL accounts and journals exist...")
    from apps.finance.models import ChartOfAccount, Journal
    ChartOfAccount.objects.get_or_create(code='1000', defaults={'name': 'Main Bank Account', 'account_type': 'asset'})
    ChartOfAccount.objects.get_or_create(code='4000', defaults={'name': 'Sale Revenue', 'account_type': 'revenue'})
    ChartOfAccount.objects.get_or_create(code='5100', defaults={'name': 'Commission Expense', 'account_type': 'expense'})
    ChartOfAccount.objects.get_or_create(code='2400', defaults={'name': 'Commission Payable', 'account_type': 'liability'})
    ChartOfAccount.objects.get_or_create(code='1510', defaults={'name': 'Property Inventory', 'account_type': 'asset'})
    ChartOfAccount.objects.get_or_create(code='5000', defaults={'name': 'Cost of Sales', 'account_type': 'expense'})
    
    Journal.objects.get_or_create(code='SJ', defaults={'name': 'Sales Journal', 'is_active': True})
    Journal.objects.get_or_create(code='CJ', defaults={'name': 'Commission Journal', 'is_active': True})
    Journal.objects.get_or_create(code='GJ', defaults={'name': 'General Journal', 'is_active': True})
    
    # 0. Capture baseline
    base_data = get_dashboard_data()
    initial_pipe = Decimal(base_data['kpis']['sales']['pipeline_value'])
    initial_rev = Decimal(base_data['kpis']['finance']['revenue'])
    print(f"Baseline: Pipeline R{initial_pipe}, Revenue R{initial_rev}")

    # 1. Setup Test Data
    print("Setting up Lead/Opportunity test data...")
    pipeline = Pipeline.objects.filter(pipeline_type='sale', is_default=True).first() or Pipeline.objects.first()
    initial_stage = pipeline.stages.filter(is_terminal=False).order_by('position').first()
    
    timestamp = int(timezone.now().timestamp())
    ptype, _ = PropertyType.objects.get_or_create(code='CRM-TEST', defaults={'name': 'CRM Test Type'})
    prop = Property.objects.create(
        reference_number=f'PROP-CRM-{timestamp}',
        name='CRM Test Property', 
        property_type=ptype, 
        status='available',
        current_valuation=Decimal('1500000.00')
    )
    
    dept, _ = Department.objects.get_or_create(code='SALES', defaults={'name': 'Sales Dept'})
    agent = Employee.objects.create(
        employee_number=f'AGT-CRM-{timestamp}',
        first_name='CRM', last_name='Agent', department=dept, start_date=date.today()
    )
    curr = Currency.objects.filter(code='USD').first() or Currency.objects.first()

    # 2. Create Opportunity (Active Stage)
    print("Creating Opportunity (R1,500,000 Expected Revenue)...")
    opp = Opportunity.objects.create(
        title="CRM Sync Test Deal",
        expected_revenue=Decimal('1500000.00'),
        probability=20,
        pipeline=pipeline,
        stage=initial_stage,
        property=prop,
        assigned_agent=agent,
        currency=curr,
        is_lead=False
    )
    
    # 3. Verify Dashboard (Pipeline Increase)
    data2 = get_dashboard_data()
    post_create_pipe = Decimal(data2['kpis']['sales']['pipeline_value'])
    diff = post_create_pipe - initial_pipe
    if diff == Decimal('1500000.00'):
        print(f"[OK] Pipeline Value increased correctly by R{diff}")
    else:
        print(f"[FAIL] Pipeline Value mismatch. Expected +1,500,000, got {diff}")

    # 4. Mark Won
    print("Marking deal as WON...")
    contact = Contact.objects.create(
        first_name='Lead', last_name='Prospect', email=f'crm.test.{timestamp}@example.com'
    )
    opp.contact = contact
    opp.save()
    
    opp.mark_won()
    
    # 5. Verify Dashboard (Pipeline Decrease)
    data3 = get_dashboard_data()
    post_won_pipe = Decimal(data3['kpis']['sales']['pipeline_value'])
    if post_won_pipe == initial_pipe:
        print(f"[OK] Pipeline Value returned to baseline (Deal moved to Terminal stage).")
    else:
        print(f"[FAIL] Pipeline Value not decremented. Current: R{post_won_pipe}")

    # 6. Post to Finance (Final Step)
    print("Posting terminal Sale to Finance...")
    sale = SaleTransaction.objects.get(opportunity=opp)
    
    from apps.finance.services.accounting import AccountingService
    service = AccountingService(user=admin_user)
    service.post_sale_transaction(sale)
    
    # 7. Final Revenue Verification
    data4 = get_dashboard_data()
    final_rev = Decimal(data4['kpis']['finance']['revenue'])
    rev_diff = final_rev - initial_rev
    if rev_diff == Decimal('1500000.00'):
        print(f"[OK] Final Sales Revenue increased by R{rev_diff}.")
    else:
        print(f"[FAIL] Revenue update mismatch. Expected +1,500,000, got {rev_diff}")

if __name__ == "__main__":
    verify()
