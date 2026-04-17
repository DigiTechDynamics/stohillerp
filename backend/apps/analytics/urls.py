from django.urls import path
from apps.analytics.views import (
    PortfolioAnalyticsView,
    SalesFunnelAnalyticsView,
    FinancialForecastingView,
    ContextualIntelligenceView,
)

urlpatterns = [
    path('portfolio/', PortfolioAnalyticsView.as_view(), name='analytics-portfolio'),
    path('sales-funnel/', SalesFunnelAnalyticsView.as_view(), name='analytics-sales-funnel'),
    path('forecast/', FinancialForecastingView.as_view(), name='analytics-forecast'),
    path('context/', ContextualIntelligenceView.as_view(), name='analytics-context'),
]
