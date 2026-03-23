"""Stohil Properties - Core App URLs"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .data_management import TemplateDownloadView, DataExportView, DataImportView

router = DefaultRouter()
router.register('users', views.UserViewSet, basename='users')
router.register('roles', views.RoleViewSet, basename='roles')
router.register('audit-logs', views.AuditLogViewSet, basename='audit-logs')
router.register('currencies', views.CurrencyViewSet, basename='currencies')
router.register('modules', views.ModuleViewSet, basename='modules')
router.register('sod-rules', views.SODRuleViewSet, basename='sod-rules')

urlpatterns = [
    path('', include(router.urls)),
    path('me/', views.CurrentUserView.as_view(), name='current-user'),
    path('data/template/<str:module_name>/', TemplateDownloadView.as_view(), name='data-template'),
    path('data/export/<str:module_name>/', DataExportView.as_view(), name='data-export'),
    path('data/import/<str:module_name>/', DataImportView.as_view(), name='data-import'),
]
