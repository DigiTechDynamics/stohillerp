"""Stohil Properties - Dashboard Views"""
from decimal import Decimal
from django.db.models import Sum, Count
from django.utils import timezone
from datetime import date
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated


class ExecutiveDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = date.today()
        month_start = today.replace(day=1)
        year_start = today.replace(month=1, day=1)

        from apps.properties.models import Property
        from apps.crm.models import Contact, Opportunity, PipelineStage
        from apps.sales.models import SaleTransaction
        from apps.rentals.models import Lease, RentalInvoice
        from apps.commissions.models import CommissionRecord
        from apps.finance.models import JournalLine, JournalEntry

        total_properties = Property.objects.count()
        available = Property.objects.filter(status='available').count()
        occupied = Property.objects.filter(status='occupied').count()
        under_contract = Property.objects.filter(status='under_contract').count()
        portfolio_value = Property.objects.aggregate(total=Sum('current_valuation'))['total'] or Decimal('0')

        ytd_sales = SaleTransaction.objects.filter(status='registered', transfer_date__gte=year_start)
        ytd_sales_count = ytd_sales.count()
        ytd_sales_value = ytd_sales.aggregate(total=Sum('sale_price'))['total'] or Decimal('0')
        mtd_sales_value = SaleTransaction.objects.filter(
            status='registered', transfer_date__gte=month_start
        ).aggregate(total=Sum('sale_price'))['total'] or Decimal('0')
        pipeline_value = Opportunity.objects.filter(
            stage__is_terminal=False
        ).aggregate(total=Sum('expected_value'))['total'] or Decimal('0')

        active_leases = Lease.objects.filter(status='active').count()
        monthly_income = Lease.objects.filter(status='active').aggregate(
            total=Sum('monthly_rental'))['total'] or Decimal('0')
        overdue = RentalInvoice.objects.filter(status='overdue').aggregate(
            count=Count('id'), total=Sum('balance_due'))
        
        ytd_commission = CommissionRecord.objects.filter(
            status__in=['approved', 'paid'], created_at__date__gte=year_start
        ).aggregate(total=Sum('net_commission'))['total'] or Decimal('0')
        pending_commission = CommissionRecord.objects.filter(
            status='pending').aggregate(total=Sum('net_commission'))['total'] or Decimal('0')

        total_contacts = Contact.objects.filter(status='active').count()
        new_leads = Contact.objects.filter(contact_type='lead', created_at__date__gte=month_start).count()

        revenue_chart = self._revenue_chart()
        pipeline_stages = self._pipeline_stages()
        top_agents = self._top_agents(year_start)

        return Response({
            'generated_at': timezone.now().isoformat(),
            'kpis': {
                'properties': {
                    'total': total_properties, 'available': available,
                    'occupied': occupied, 'under_contract': under_contract,
                    'portfolio_value': str(portfolio_value),
                    'occupancy_rate': round(occupied / max(total_properties, 1) * 100, 1),
                },
                'sales': {
                    'ytd_count': ytd_sales_count, 'ytd_value': str(ytd_sales_value),
                    'mtd_value': str(mtd_sales_value), 'pipeline_value': str(pipeline_value),
                },
                'rentals': {
                    'active_leases': active_leases, 'monthly_income': str(monthly_income),
                    'overdue_count': overdue['count'] or 0,
                    'overdue_amount': str(overdue['total'] or 0),
                    'annual_income': str(monthly_income * 12),
                },
                'commissions': {'ytd_paid': str(ytd_commission), 'pending': str(pending_commission)},
                'crm': {'total_contacts': total_contacts, 'new_leads_this_month': new_leads},
            },
            'charts': {
                'revenue_trend': revenue_chart,
                'pipeline_stages': pipeline_stages,
                'top_agents': top_agents,
            },
        })

    def _revenue_chart(self):
        from apps.finance.models import JournalLine, JournalEntry
        from django.db.models import Sum
        from django.db.models.functions import TruncMonth
        from datetime import date, timedelta
        start = (date.today() - timedelta(days=365)).replace(day=1)
        data = JournalLine.objects.filter(
            entry__status=JournalEntry.EntryStatus.POSTED,
            entry__entry_date__gte=start,
            account__account_type='revenue', side='credit',
        ).annotate(month=TruncMonth('entry__entry_date')).values('month').annotate(
            total=Sum('amount')).order_by('month')
        return [{'month': d['month'].strftime('%b %Y'), 'revenue': float(d['total'] or 0)} for d in data]

    def _pipeline_stages(self):
        from apps.crm.models import PipelineStage
        from django.db.models import Count, Sum
        stages = PipelineStage.objects.filter(is_terminal=False).annotate(
            deal_count=Count('opportunities'),
            total_value=Sum('opportunities__expected_value'),
        ).order_by('position')
        return [{'stage': s.name, 'color': s.color, 'count': s.deal_count, 'value': float(s.total_value or 0)} for s in stages]

    def _top_agents(self, since):
        from apps.hr.models import Employee
        from django.db.models import Sum, Count
        agents = Employee.objects.filter(
            status='active',
            commissions__status__in=['approved', 'paid'],
            commissions__created_at__date__gte=since,
        ).annotate(
            total_commission=Sum('commissions__net_commission'),
            deal_count=Count('commissions'),
        ).order_by('-total_commission')[:5]
        return [{'name': a.full_name, 'employee_number': a.employee_number,
                 'total_commission': float(a.total_commission or 0), 'deal_count': a.deal_count} for a in agents]


class AgentDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.hr.models import Employee
        from apps.commissions.models import CommissionRecord
        from apps.crm.models import Activity, Opportunity
        from django.db.models import Sum, Count
        from datetime import date

        employee = getattr(request.user, 'employee', None)
        if not employee:
            return Response({'error': 'No employee profile found'}, status=404)

        year_start = date.today().replace(month=1, day=1)
        ytd = CommissionRecord.objects.filter(
            agent=employee, status__in=['approved', 'paid'],
            created_at__date__gte=year_start
        ).aggregate(total=Sum('net_commission'), count=Count('id'))
        pending_activities = Activity.objects.filter(assigned_to=employee, status='planned').count()
        active_opps = Opportunity.objects.filter(assigned_agent=employee, stage__is_terminal=False).count()

        return Response({
            'agent_name': employee.full_name,
            'ytd_commission': str(ytd['total'] or 0),
            'ytd_deals': ytd['count'],
            'pending_activities': pending_activities,
            'active_opportunities': active_opps,
        })
