"""Stohil Properties - Dashboard Views"""
from decimal import Decimal
from django.db.models import Sum, Count
from django.utils import timezone
from datetime import date
from rest_framework.views import APIView
from rest_framework.response import Response

from apps.core.company import base_currency_code


class ExecutiveDashboardView(APIView):

    def get(self, request):
        # Business-timezone date (TIME_ZONE), not the server clock.
        today = timezone.localdate()
        month_start = today.replace(day=1)
        prev_month_end = month_start - timezone.timedelta(days=1)
        prev_month_start = prev_month_end.replace(day=1)
        year_start = today.replace(month=1, day=1)

        from django.db.models import Sum, Count, Q
        from django.db import models
        from apps.properties.models import Property
        from apps.crm.models import Contact, Opportunity
        from apps.sales.models import SaleTransaction
        from apps.rentals.models import Lease, RentalInvoice
        from apps.finance.models import ChartOfAccount, JournalLine, JournalEntry
        from apps.commissions.models import CommissionRecord

        total_properties = Property.objects.count()
        available = Property.objects.filter(status='available').count()
        occupied = Property.objects.filter(status='occupied').count()
        under_contract = Property.objects.filter(status='under_contract').count()
        portfolio_value = Property.objects.aggregate(total=Sum('current_valuation'))['total'] or Decimal('0')
        
        # Trend: Portfolio Value (vs last month)
        prev_portfolio_value = Property.objects.filter(
            created_at__date__lte=prev_month_end
        ).aggregate(total=Sum('current_valuation'))['total'] or Decimal('0')
        portfolio_trend = self._calc_trend(portfolio_value, prev_portfolio_value)

        from apps.sales.stats import base_totals
        missing_rates = set()
        registered = SaleTransaction.objects.filter(status='registered')
        ytd_sales_count, ytd_sales_value, _c = base_totals(
            registered.filter(transfer_date__gte=year_start, transfer_date__lte=today), missing_rates)
        
        # Trend: YTD sales vs the same period last year.
        try:
            last_year_today = today.replace(year=today.year - 1)
        except ValueError:                      # 29 February
            last_year_today = today.replace(year=today.year - 1, day=28)
        _n, prior_ytd_value, _c = base_totals(registered.filter(
            transfer_date__gte=year_start.replace(year=today.year - 1), transfer_date__lte=last_year_today),
            missing_rates)
        sales_trend = self._calc_trend(ytd_sales_value, prior_ytd_value)

        _n, mtd_sales_value, _c = base_totals(
            registered.filter(transfer_date__gte=month_start, transfer_date__lte=today), missing_rates)
        pipeline_value = Opportunity.objects.filter(
            stage__is_terminal=False
        ).aggregate(total=Sum('expected_revenue'))['total'] or Decimal('0')

        active_leases = Lease.objects.filter(status='active').count()
        monthly_income = Lease.objects.filter(status='active').aggregate(
            total=Sum('monthly_rental'))['total'] or Decimal('0')
        
        # Trend: Rentals (vs last month)
        prev_monthly_income = Lease.objects.filter(
            status='active', created_at__date__lte=prev_month_end
        ).aggregate(total=Sum('monthly_rental'))['total'] or Decimal('0')
        rentals_trend = self._calc_trend(monthly_income, prev_monthly_income)

        overdue = RentalInvoice.objects.filter(status='overdue').aggregate(
            count=Count('id'), total=Sum('balance_due'))
        
        # Finance KPIs
        cash_position = ChartOfAccount.objects.filter(
            account_sub_type='bank', is_active=True
        ).aggregate(total=Sum('current_balance'))['total'] or Decimal('0')
        
        # Year to date, net of debits/credits (credit notes and reversals reduce revenue).
        def ytd_net(account_type, normal_side):
            agg = JournalLine.objects.filter(
                entry__status__in=JournalEntry.LEDGER_STATUSES,
                entry__entry_date__gte=year_start, entry__entry_date__lte=today,
                account__account_type=account_type,
            ).aggregate(dr=Sum('amount', filter=Q(side='debit')), cr=Sum('amount', filter=Q(side='credit')))
            dr, cr = agg['dr'] or Decimal('0'), agg['cr'] or Decimal('0')
            return cr - dr if normal_side == 'credit' else dr - cr

        revenue = ytd_net('revenue', 'credit')
        expenses = ytd_net('expense', 'debit')
        
        operating_margin = 0
        if revenue > 0:
            operating_margin = round(((revenue - expenses) / revenue) * 100, 1)

        # Commissions KPIs
        commissions_ytd = CommissionRecord.objects.filter(
            status__in=['approved', 'paid'],
            created_at__year=today.year
        ).aggregate(
            paid=Sum('net_commission', filter=Q(status='paid')),
            pending=Sum('net_commission', filter=Q(status='approved'))
        )

        return Response({
            'generated_at': timezone.now().isoformat(),
            'currency': base_currency_code(),
            'missing_rates': sorted(missing_rates),
            'period': {'year_start': year_start, 'today': today},
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
                'finance': {
                    'cash_position': str(cash_position),
                    'operating_margin': operating_margin,
                    'revenue': str(revenue),
                    'expenses': str(expenses),
                },
                'commissions': {
                    'ytd_paid': str(commissions_ytd['paid'] or 0),
                    'pending': str(commissions_ytd['pending'] or 0),
                },
                'crm': {'total_contacts': Contact.objects.filter(status='active').count(), 
                        'new_leads_this_month': Contact.objects.filter(contact_type='lead', created_at__date__gte=month_start).count()},
            },
            'trends': {
                'portfolio': portfolio_trend,
                'sales': sales_trend,
                'rentals': rentals_trend,
            },
            'charts': {
                'revenue_trend': self._revenue_chart(),
                'pipeline_stages': self._pipeline_stages(),
                'top_agents': self._top_agents(year_start),
            },
        })

    def _calc_trend(self, current, previous):
        # No earlier figure means there is nothing to compare with: no trend.
        if not previous:
            return None
        return round(float((current - previous) / previous) * 100, 1)

    def _revenue_chart(self):
        from apps.finance.models import JournalLine, JournalEntry
        from django.db.models import Sum
        from django.db.models.functions import TruncMonth
        from datetime import timedelta
        from django.db.models import Q
        start = (timezone.localdate() - timedelta(days=365)).replace(day=1)
        data = JournalLine.objects.filter(
            entry__status__in=JournalEntry.LEDGER_STATUSES,
            entry__entry_date__gte=start,
            account__account_type='revenue',
        ).annotate(month=TruncMonth('entry__entry_date')).values('month').annotate(
            cr=Sum('amount', filter=Q(side='credit')), dr=Sum('amount', filter=Q(side='debit'))).order_by('month')
        return [{'month': d['month'].strftime('%b %Y'), 'revenue': float((d['cr'] or 0) - (d['dr'] or 0))} for d in data]

    def _pipeline_stages(self):
        from apps.crm.models import PipelineStage
        from django.db.models import Count, Sum
        stages = PipelineStage.objects.filter(is_terminal=False).annotate(
            deal_count=Count('opportunities'),
            total_value=Sum('opportunities__expected_revenue'),
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

    def get(self, request):
        from apps.hr.models import Employee
        from apps.commissions.models import CommissionRecord
        from apps.crm.models import Activity, Opportunity
        from django.db.models import Sum, Count
        from datetime import date

        employee = getattr(request.user, 'employee', None)
        if not employee:
            return Response({'error': 'No employee profile found'}, status=404)

        year_start = timezone.localdate().replace(month=1, day=1)
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
