"""Stohil Properties - Business Intelligence & Analytics Views"""
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Avg, Q, F, ExpressionWrapper, DurationField
from django.db.models.functions import TruncMonth
from django.utils import timezone
from decimal import Decimal
from datetime import date, timedelta

from apps.properties.models import Property
from apps.rentals.models import Lease
from apps.crm.models import Opportunity, PipelineStage
from apps.finance.models import JournalLine, JournalEntry

class PortfolioAnalyticsView(APIView):
    """
    Deep dive into property portfolio performance: Yields and Occupancy.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # 1. Yield Analysis
        properties = Property.objects.filter(status__in=['available', 'occupied', 'listed_rent'])
        
        total_valuation = properties.aggregate(total=Sum('current_valuation'))['total'] or Decimal('0')
        total_annual_rent = properties.aggregate(total=Sum(F('rental_rate') * 12))['total'] or Decimal('0')
        
        # Calculate expenses safely
        total_annual_expenses = properties.aggregate(
            total=Sum(F('rates_monthly') * 12 + F('levies_monthly') * 12)
        )['total'] or Decimal('0')

        gross_yield = (total_annual_rent / total_valuation * 100) if total_valuation > 0 else 0
        net_yield = ((total_annual_rent - total_annual_expenses) / total_valuation * 100) if total_valuation > 0 else 0

        # 2. Vacancy Rate
        total_units = properties.count()
        vacant_units = properties.filter(status='available').count()
        vacancy_rate = (vacant_units / total_units * 100) if total_units > 0 else 0

        # 3. Property Type Breakdown
        type_data = properties.values('property_type__name').annotate(
            count=Count('id'),
            total_value=Sum('current_valuation'),
            avg_yield=Avg(F('rental_rate') * 12 / F('current_valuation') * 100)
        ).order_by('-total_value')

        return Response({
            'overview': {
                'total_portfolio_value': float(total_valuation),
                'gross_yield': round(float(gross_yield), 2),
                'net_yield': round(float(net_yield), 2),
                'vacancy_rate': round(float(vacancy_rate), 2),
                'total_units': total_units,
                'vacant_units': vacant_units,
            },
            'by_type': [
                {
                    'type': d['property_type__name'],
                    'count': d['count'],
                    'value': float(d['total_value'] or 0),
                    'yield': round(float(d['avg_yield'] or 0), 2)
                } for d in type_data
            ]
        })

class SalesFunnelAnalyticsView(APIView):
    """
    CRM Pipeline efficiency and conversion metrics.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # 1. Conversion Rates
        total_opps = Opportunity.objects.count()
        won_opps = Opportunity.objects.filter(stage__is_won=True).count()
        terminal_opps = Opportunity.objects.filter(stage__is_terminal=True).count()
        
        win_rate = (won_opps / terminal_opps * 100) if terminal_opps > 0 else 0

        # 2. Avg Time to Close (Days) - Real Calculation
        velocity_query = Opportunity.objects.filter(
            stage__is_terminal=True, 
            date_closed__isnull=False
        ).annotate(
            duration=ExpressionWrapper(F('date_closed') - F('created_at'), output_field=DurationField())
        ).aggregate(avg_duration=Avg('duration'))
        
        avg_duration = velocity_query['avg_duration']
        avg_days_to_close = avg_duration.days if avg_duration else 0

        # 3. Funnel Stage Distribution
        stages = PipelineStage.objects.filter(is_terminal=False).annotate(
            count=Count('opportunities'),
            value=Sum('opportunities__expected_revenue')
        ).order_by('position')

        return Response({
            'metrics': {
                'total_leads': total_opps,
                'win_rate': round(float(win_rate), 2),
                'avg_close_cycle_days': avg_days_to_close,
            },
            'funnel': [
                {
                    'stage': s.name,
                    'count': s.count,
                    'value': float(s.value or 0)
                } for s in stages
            ]
        })

class FinancialForecastingView(APIView):
    """
    Projected Cash Flow vs Actuals.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        # Calculate monthly revenue forecast based on active leases
        active_leases = Lease.objects.filter(status='active')
        # Corrected field: rent_amount -> monthly_rental
        monthly_forecast = active_leases.aggregate(total=Sum('monthly_rental'))['total'] or Decimal('0')

        # Compare with actual collected revenue in last 30 days
        start_of_month = date.today().replace(day=1)
        actual_revenue = JournalLine.objects.filter(
            entry__status=JournalEntry.EntryStatus.POSTED,
            entry__entry_date__gte=start_of_month,
            account__account_type='revenue',
            side='credit'
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        return Response({
            'current_month': {
                'forecasted': float(monthly_forecast),
                'actual_collected': float(actual_revenue),
                'variance': float(actual_revenue - monthly_forecast),
                'collection_rate': round(float((actual_revenue / monthly_forecast * 100) if monthly_forecast > 0 else 0), 2)
            }
        })
