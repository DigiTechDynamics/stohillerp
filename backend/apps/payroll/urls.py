from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import PayrollRunViewSet, PayslipViewSet, TaxBracketViewSet, PayrollSettingViewSet, SalaryRuleViewSet, SalaryStructureViewSet

router = DefaultRouter()
router.register(r'runs', PayrollRunViewSet)
router.register(r'payslips', PayslipViewSet)
router.register(r'tax-brackets', TaxBracketViewSet)
router.register(r'settings', PayrollSettingViewSet)
router.register(r'salary-rules', SalaryRuleViewSet)
router.register(r'salary-structures', SalaryStructureViewSet)

urlpatterns = [
    path('', include(router.urls)),
]

