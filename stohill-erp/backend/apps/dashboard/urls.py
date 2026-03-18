from django.urls import path
from . import views
urlpatterns = [
    path('executive/', views.ExecutiveDashboardView.as_view(), name='executive-dashboard'),
    path('agent/', views.AgentDashboardView.as_view(), name='agent-dashboard'),
]
