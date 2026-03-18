from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
router = DefaultRouter()
router.register('transactions', views.SaleTransactionViewSet, basename='sale-transactions')
urlpatterns = [path('', include(router.urls))]
