from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.procurement.views import GoodsReceiptViewSet, PurchaseOrderViewSet

router = DefaultRouter()
router.register('orders', PurchaseOrderViewSet, basename='purchase-orders')
router.register('receipts', GoodsReceiptViewSet, basename='goods-receipts')

urlpatterns = [path('', include(router.urls))]
