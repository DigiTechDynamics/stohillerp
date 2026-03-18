from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
router = DefaultRouter()
router.register('records', views.CommissionRecordViewSet, basename='commissions')
router.register('structures', views.CommissionStructureViewSet, basename='commission-structures')
urlpatterns = [path('', include(router.urls))]
