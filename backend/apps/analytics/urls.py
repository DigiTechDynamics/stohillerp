from django.urls import path
from apps.analytics.views import (
    PortfolioAnalyticsView,
    SalesFunnelAnalyticsView,
    FinancialForecastingView,
)

urlpatterns = [
    path('portfolio/', PortfolioAnalyticsView.as_view(), name='analytics-portfolio'),
    path('sales-funnel/', SalesFunnelAnalyticsView.as_view(), name='analytics-sales-funnel'),
    path('forecast/', FinancialForecastingView.as_view(), name='analytics-forecast'),
]
