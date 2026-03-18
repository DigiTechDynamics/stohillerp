from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AssetCategoryViewSet, FixedAssetViewSet, AssetBookViewSet,
    AssetLocationViewSet, AssetTransactionViewSet
)

router = DefaultRouter()
router.register('categories', AssetCategoryViewSet)
router.register('assets', FixedAssetViewSet)
router.register('books', AssetBookViewSet)
router.register('locations', AssetLocationViewSet)
router.register('transactions', AssetTransactionViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
