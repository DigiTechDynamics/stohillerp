from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.procurement.views import PurchaseOrderViewSet

router = DefaultRouter()
router.register(r'purchase-orders', PurchaseOrderViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
