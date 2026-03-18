from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PayrollRunViewSet, PayrollItemViewSet, TaxBracketViewSet, PayrollSettingViewSet

router = DefaultRouter()
router.register(r'runs', PayrollRunViewSet)
router.register(r'items', PayrollItemViewSet)
router.register(r'tax-brackets', TaxBracketViewSet)
router.register(r'settings', PayrollSettingViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
