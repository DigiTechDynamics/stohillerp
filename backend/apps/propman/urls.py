from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.propman import views
from apps.propman.defaults import DefaultsView

router = DefaultRouter()
router.register('tariffs', views.UtilityTariffViewSet, basename='tariffs')
router.register('meters', views.MeterViewSet, basename='meters')
router.register('meter-readings', views.MeterReadingViewSet, basename='meter-readings')
router.register('recovery-schedules', views.RecoveryScheduleViewSet, basename='recovery-schedules')
router.register('recovery-shares', views.RecoveryShareViewSet, basename='recovery-shares')
router.register('recovery-reconciliations', views.RecoveryReconciliationViewSet, basename='recovery-reconciliations')
router.register('escalation-steps', views.EscalationStepViewSet, basename='escalation-steps')
router.register('cpi', views.CPIIndexViewSet, basename='cpi')
router.register('lease-options', views.LeaseOptionViewSet, basename='lease-options')
router.register('guarantees', views.LeaseGuaranteeViewSet, basename='guarantees')
router.register('turnover-reports', views.TurnoverReportViewSet, basename='turnover-reports')
router.register('arrears-stages', views.ArrearsStageViewSet, basename='arrears-stages')
router.register('arrears-cases', views.ArrearsCaseViewSet, basename='arrears-cases')
router.register('debit-mandates', views.DebitOrderMandateViewSet, basename='debit-mandates')
router.register('debit-batches', views.DebitOrderBatchViewSet, basename='debit-batches')
router.register('deposit-interest', views.DepositInterestViewSet, basename='deposit-interest')
router.register('owner-payment-runs', views.OwnerPaymentRunViewSet, basename='owner-payment-runs')
router.register('applications', views.TenantApplicationViewSet, basename='applications')
router.register('maintenance-quotes', views.MaintenanceQuoteViewSet, basename='maintenance-quotes')
router.register('maintenance-plans', views.MaintenancePlanViewSet, basename='maintenance-plans')
router.register('saved-reports', views.SavedReportViewSet, basename='saved-reports')

urlpatterns = [
    path('reports/<str:key>/', views.ReportView.as_view(), name='propman-report'),
    path('defaults/', DefaultsView.as_view(), name='propman-defaults'),
    path('distribution/<str:kind>/', views.DistributionView.as_view(), name='propman-distribution'),
    path('', include(router.urls)),
]
