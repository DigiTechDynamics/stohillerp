from django.urls import path
from . import views
urlpatterns = [
    path('executive/', views.ExecutiveDashboardView.as_view(), name='executive-dashboard'),
    path('agent/', views.AgentDashboardView.as_view(), name='agent-dashboard'),
    path('finance/', views.FinanceDashboardView.as_view(), name='finance-dashboard'),
    path('rental/', views.RentalDashboardView.as_view(), name='rental-dashboard'),
    path('supply-chain/', views.SupplyChainDashboardView.as_view(), name='supply-chain-dashboard'),
    path('hr/', views.HRDashboardView.as_view(), name='hr-dashboard'),
]
