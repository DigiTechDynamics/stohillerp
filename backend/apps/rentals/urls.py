from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import owners, views

router = DefaultRouter()
router.register('leases', views.LeaseViewSet, basename='leases')
router.register('invoices', views.RentalInvoiceViewSet, basename='rental-invoices')
router.register('payments', views.RentalPaymentViewSet, basename='rental-payments')
router.register('maintenance', views.MaintenanceViewSet, basename='maintenance')
router.register('charges', views.LeaseChargeViewSet, basename='lease-charges')
router.register('owners', owners.OwnerViewSet, basename='owners')

urlpatterns = [path('', include(router.urls))]
