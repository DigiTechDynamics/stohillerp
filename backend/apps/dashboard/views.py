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
        user = request.user
        # Get accessible module codes
        modules = user.accessible_modules
        is_super = user.is_superuser or 'super_admin' in [r.role_type for r in user.roles.all()]
        
        today = date.today()
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
        from apps.procurement.models import PurchaseOrder
        from apps.inventory.models import Product

        res_kpis = {}
        res_trends = {}
        res_charts = {}

        # ─── Properties Module ─────────────────────────────────────────
        if is_super or 'properties' in modules:
            total_properties = Property.objects.count()
            available = Property.objects.filter(status='available').count()
            occupied = Property.objects.filter(status='occupied').count()
            under_contract = Property.objects.filter(status='under_contract').count()
            portfolio_value = Property.objects.aggregate(total=Sum('current_valuation'))['total'] or Decimal('0')
            
            # Trend: Portfolio Value (vs last month)
            prev_portfolio_value = Property.objects.filter(
                created_at__lte=prev_month_end
            ).aggregate(total=Sum('current_valuation'))['total'] or Decimal('0')
            portfolio_trend = self._calc_trend(portfolio_value, prev_portfolio_value)
            
            res_kpis['properties'] = {
                'total': total_properties, 'available': available,
                'occupied': occupied, 'under_contract': under_contract,
                'portfolio_value': str(portfolio_value),
                'occupancy_rate': round(occupied / max(total_properties, 1) * 100, 1),
            }
            res_trends['portfolio'] = portfolio_trend

        # ─── Sales & Commissions Modules ──────────────────────────────
        if is_super or 'sales' in modules:
            ytd_sales = SaleTransaction.objects.filter(status='registered', transfer_date__gte=year_start)
            ytd_sales_count = ytd_sales.count()
            ytd_sales_value = ytd_sales.aggregate(total=Sum('sale_price'))['total'] or Decimal('0')
            
            # Trend: Sales (vs last year same period)
            prev_year_start = year_start.replace(year=year_start.year - 1)
            try:
                prev_year_end = today.replace(year=today.year - 1)
            except ValueError:
                prev_year_end = today.replace(year=today.year - 1, day=28)
                
            prev_ytd_sales_value = SaleTransaction.objects.filter(
                status='registered', 
                transfer_date__gte=prev_year_start,
                transfer_date__lte=prev_year_end
            ).aggregate(total=Sum('sale_price'))['total'] or Decimal('0')
            sales_trend = self._calc_trend(ytd_sales_value, prev_ytd_sales_value)

            mtd_sales_value = SaleTransaction.objects.filter(
                status='registered', transfer_date__gte=month_start
            ).aggregate(total=Sum('sale_price'))['total'] or Decimal('0')
            pipeline_value = Opportunity.objects.filter(
                stage__is_terminal=False
            ).aggregate(total=Sum('expected_revenue'))['total'] or Decimal('0')

            res_kpis['sales'] = {
                'ytd_count': ytd_sales_count, 'ytd_value': str(ytd_sales_value),
                'mtd_value': str(mtd_sales_value), 'pipeline_value': str(pipeline_value),
            }
            res_trends['sales'] = sales_trend
            res_charts['pipeline_stages'] = self._pipeline_stages()
            res_charts['top_agents'] = self._top_agents(year_start)

        # ─── CRM Module ───────────────────────────────────────────────
        if is_super or 'crm' in modules:
            res_kpis['crm'] = {
                'total_contacts': Contact.objects.filter(status='active').count(), 
                'new_leads_this_month': Contact.objects.filter(contact_type='lead', created_at__gte=month_start).count()
            }

        # ─── Rentals Module ───────────────────────────────────────────
        if is_super or 'rentals' in modules:
            active_leases = Lease.objects.filter(status='active').count()
            monthly_income = Lease.objects.filter(status='active').aggregate(
                total=Sum('monthly_rental'))['total'] or Decimal('0')
            
            # Trend: Rentals (vs last month)
            prev_monthly_income = Lease.objects.filter(
                status='active', created_at__lte=prev_month_end
            ).aggregate(total=Sum('monthly_rental'))['total'] or Decimal('0')
            rentals_trend = self._calc_trend(monthly_income, prev_monthly_income)

            overdue = RentalInvoice.objects.filter(status='overdue').aggregate(
                count=Count('id'), total=Sum('balance_due'))

            res_kpis['rentals'] = {
                'active_leases': active_leases, 'monthly_income': str(monthly_income),
                'overdue_count': overdue['count'] or 0,
                'overdue_amount': str(overdue['total'] or 0),
                'annual_income': str(monthly_income * 12),
            }
            res_trends['rentals'] = rentals_trend

        # ─── Finance Module ───────────────────────────────────────────
        if is_super or 'finance_gl' in modules:
            # Finance KPIs
            cash_position = ChartOfAccount.objects.filter(
                account_sub_type='bank', is_active=True
            ).aggregate(total=Sum('current_balance'))['total'] or Decimal('0')
            
            revenue = JournalLine.objects.filter(
                entry__status=JournalEntry.EntryStatus.POSTED,
                account__account_type='revenue'
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
            expenses = JournalLine.objects.filter(
                entry__status=JournalEntry.EntryStatus.POSTED,
                account__account_type='expense'
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0')
            
            revenue = Decimal(str(revenue))
            expenses = Decimal(str(expenses))
            
            operating_margin = 0
            if revenue > 0:
                operating_margin = round(float(((revenue - expenses) / revenue) * 100), 1)

            res_kpis['finance'] = {
                'cash_position': str(cash_position),
                'operating_margin': operating_margin,
                'revenue': str(revenue),
                'expenses': str(expenses),
            }
            res_charts['revenue_trend'] = self._revenue_chart()

        # ─── Commissions Module (Extra check) ─────────────────────────
        if is_super or 'commissions' in modules:
            commissions_ytd = CommissionRecord.objects.filter(
                status__in=['approved', 'paid'],
                created_at__year=today.year
            ).aggregate(
                paid=Sum('net_commission', filter=Q(status='paid')),
                pending=Sum('net_commission', filter=Q(status='approved'))
            )
            res_kpis['commissions'] = {
                'ytd_paid': str(commissions_ytd['paid'] or 0),
                'pending': str(commissions_ytd['pending'] or 0),
            }

        # ─── Supply Chain Modules ────────────────────────────────────
        if is_super or 'procurement' in modules or 'inventory' in modules:
            pending_approvals = PurchaseOrder.objects.filter(
                status__in=['pending_md', 'pending_finance']
            ).count()
            low_stock_count = Product.objects.filter(
                product_type='storable',
                is_active=True
            ).annotate(
                total_on_hand=Sum('quants__quantity_on_hand')
            ).filter(total_on_hand__lte=Decimal('5')).count()

            res_kpis['supply_chain'] = {
                'pending_approvals': pending_approvals,
                'low_stock_items': low_stock_count
            }

        return Response({
            'generated_at': timezone.now().isoformat(),
            'kpis': res_kpis,
            'trends': res_trends,
            'charts': res_charts,
        })

    def _calc_trend(self, current, previous):
        current = Decimal(str(current or '0'))
        previous = Decimal(str(previous or '0'))
        if not previous or previous == 0:
            return 100.0 if current > 0 else 0.0
        return round(float(((current - previous) / previous) * 100), 1)

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


class FinanceDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.finance.models import ChartOfAccount, JournalLine, JournalEntry, FixedAsset
        from apps.banking.models import BankStatement
        from django.db.models import Sum, Q

        today = date.today()
        year_start = today.replace(month=1, day=1)

        # Cash & Liquidity
        bank_accounts = ChartOfAccount.objects.filter(account_sub_type='bank', is_active=True)
        cash_total = bank_accounts.aggregate(total=Sum('current_balance'))['total'] or Decimal('0')

        # AP/AR Aging (Simplified)
        ar_total = ChartOfAccount.objects.filter(account_type='asset', account_sub_type='receivable').aggregate(total=Sum('current_balance'))['total'] or Decimal('0')
        ap_total = ChartOfAccount.objects.filter(account_type='liability', account_sub_type='payable').aggregate(total=Sum('current_balance'))['total'] or Decimal('0')

        # Revenue vs Budget/Last Year MTD
        mtd_revenue = JournalLine.objects.filter(
            entry__status=JournalEntry.EntryStatus.POSTED,
            entry__entry_date__gte=today.replace(day=1),
            account__account_type='revenue'
        ).aggregate(total=Sum('amount'))['total'] or Decimal('0')

        # Assets
        asset_count = FixedAsset.objects.count()
        asset_value = FixedAsset.objects.all().aggregate(total=Sum('original_cost'))['total'] or Decimal('0')

        return Response({
            'kpis': {
                'cash_position': str(cash_total),
                'ar_balance': str(ar_total),
                'ap_balance': str(ap_total),
                'mtd_revenue': str(mtd_revenue),
                'asset_count': asset_count,
                'asset_value': str(asset_value)
            },
            'recent_entries': JournalEntry.objects.all().order_by('-entry_date')[:5].values('entry_number', 'entry_date', 'status', 'description'),
            'bank_reconciliations': BankStatement.objects.filter(status='draft').count()
        })


class RentalDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.rentals.models import Lease, RentalInvoice, MaintenanceRequest
        from apps.properties.models import Property
        from django.db.models import Sum, Count

        active_leases = Lease.objects.filter(status='active')
        occupancy_rate = 0
        total_props = Property.objects.count()
        if total_props > 0:
            occupancy_rate = round((Property.objects.filter(status='occupied').count() / total_props) * 100, 1)

        mtd_collections = RentalInvoice.objects.filter(
            status='paid', 
            updated_at__gte=date.today().replace(day=1)
        ).aggregate(total=Sum('amount_paid'))['total'] or Decimal('0')

        overdue_invoices = RentalInvoice.objects.filter(status='overdue').count()
        pending_maintenance = MaintenanceRequest.objects.filter(status__in=['logged', 'acknowledged', 'in_progress', 'pending_parts']).count()

        from django.db.models import F
        return Response({
            'kpis': {
                'occupancy_rate': occupancy_rate,
                'active_leases': active_leases.count(),
                'mtd_collections': str(mtd_collections),
                'overdue_invoices': overdue_invoices,
                'pending_maintenance': pending_maintenance,
                'expiring_soon': Lease.objects.filter(status='active', end_date__lte=date.today() + timezone.timedelta(days=60)).count()
            },
            'recent_maintenance': MaintenanceRequest.objects.all().annotate(title=F('category')).order_by('-created_at')[:5].values('title', 'status', 'priority', 'property__name')
        })


class SupplyChainDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.procurement.models import PurchaseOrder
        from apps.inventory.models import Product, StockQuant
        from django.db.models import Sum

        open_pos = PurchaseOrder.objects.exclude(status__in=['billed', 'cancelled']).count()
        inventory_value = StockQuant.objects.all().aggregate(
            total=Sum(models.F('quantity_on_hand') * models.F('product__standard_price'))
        )['total'] or Decimal('0')

        low_stock = Product.objects.filter(product_type='storable', is_active=True).annotate(
            total_on_hand=Sum('quants__quantity_on_hand')
        ).filter(total_on_hand__lte=models.F('reorder_point')).count()

        return Response({
            'kpis': {
                'open_purchase_orders': open_pos,
                'inventory_valuation': str(inventory_value),
                'low_stock_alerts': low_stock,
                'pending_deliveries': PurchaseOrder.objects.filter(status='purchase').count()
            },
            'recent_pos': PurchaseOrder.objects.all().order_by('-created_at')[:5].values('po_number', 'status', 'vendor__name', 'total_amount')
        })


class HRDashboardView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from apps.hr.models import Employee, LeaveRequest
        from apps.payroll.models import PayrollBatch
        from django.db.models import Count

        headcount = Employee.objects.filter(status='active').count()
        pending_leave = LeaveRequest.objects.filter(status='pending').count()
        open_roles = 0 # Placeholder if recruitment exists

        current_payroll = PayrollBatch.objects.exclude(status='posted').order_by('-period__end_date').first()

        return Response({
            'kpis': {
                'total_headcount': headcount,
                'pending_leave_requests': pending_leave,
                'active_employees': headcount,
                'current_payroll_status': current_payroll.status if current_payroll else 'N/A'
            },
            'upcoming_birthdays': Employee.objects.all().order_by('date_of_birth')[:5].values('full_name', 'date_of_birth')
        })
