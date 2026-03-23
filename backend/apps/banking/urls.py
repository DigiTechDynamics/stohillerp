from django.urls import path, include
from rest_framework.routers import DefaultRouter
from apps.banking.views import (
    CorporateBankAccountViewSet, CorporateBankStatementViewSet, 
    CorporateBankStatementLineViewSet, ReconciliationRuleViewSet
)

router = DefaultRouter()
router.register(r'accounts', CorporateBankAccountViewSet)
router.register(r'statements', CorporateBankStatementViewSet)
router.register(r'lines', CorporateBankStatementLineViewSet)
router.register(r'reconciliation-rules', ReconciliationRuleViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
