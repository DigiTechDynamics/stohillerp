from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.inventory.views import (
    ProductViewSet, WarehouseViewSet, 
    StockMoveViewSet, StockQuantViewSet
)

router = DefaultRouter()
router.register(r'products', ProductViewSet)
router.register(r'warehouses', WarehouseViewSet)
router.register(r'moves', StockMoveViewSet)
router.register(r'quants', StockQuantViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
