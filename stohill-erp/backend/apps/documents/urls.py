from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
router = DefaultRouter()
router.register('', views.DocumentViewSet, basename='documents')
router.register('compliance', views.ComplianceRecordViewSet, basename='compliance')
urlpatterns = [path('', include(router.urls))]
