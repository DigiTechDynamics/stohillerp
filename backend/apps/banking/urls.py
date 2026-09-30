from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.banking.views import (
    BankAccountViewSet, CorporateBankStatementLineViewSet, CorporateBankStatementViewSet, ReconciliationRuleViewSet,
)

router = DefaultRouter()
router.register(r'accounts', BankAccountViewSet, basename='bank-accounts')
router.register(r'statements', CorporateBankStatementViewSet, basename='bank-statements')
router.register(r'lines', CorporateBankStatementLineViewSet, basename='bank-statement-lines')
router.register(r'reconciliation-rules', ReconciliationRuleViewSet, basename='reconciliation-rules')

urlpatterns = [
    path('', include(router.urls)),
]
