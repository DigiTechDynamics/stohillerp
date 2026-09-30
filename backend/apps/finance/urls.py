from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import approval_views, reports, settlement_views, views
router = DefaultRouter()
router.register('accounts', views.ChartOfAccountViewSet, basename='coa')
router.register('journals', views.JournalViewSet, basename='journals')
router.register('batches', views.JournalBatchViewSet, basename='journal-batches')
router.register('entries', views.JournalEntryViewSet, basename='journal-entries')
router.register('fiscal-years', views.FiscalYearViewSet, basename='fiscal-years')
router.register('periods', views.FiscalPeriodViewSet, basename='fiscal-periods')
router.register('currencies', views.CurrencyViewSet, basename='currencies')
router.register('exchange-rates', views.ExchangeRateViewSet, basename='exchange-rates')
router.register('posting-profiles', views.PostingProfileViewSet, basename='posting-profiles')

# AP Routers
router.register('suppliers', views.SupplierViewSet, basename='suppliers')
router.register('supplier-invoices', views.SupplierInvoiceViewSet, basename='supplier-invoices')
router.register('supplier-payments', views.SupplierPaymentViewSet, basename='supplier-payments')

# AR Routers
router.register('customers', views.CustomerProfileViewSet, basename='customers')
router.register('customer-invoices', views.CustomerInvoiceViewSet, basename='customer-invoices')
router.register('customer-receipts', views.CustomerReceiptViewSet, basename='customer-receipts')

# Bank & Tax Routers 
router.register('bank-accounts', views.BankAccountViewSet, basename='bank-accounts')
router.register('tax-codes', views.TaxCodeViewSet, basename='tax-codes')
router.register('transactions', views.JournalLineViewSet, basename='journal-lines')
router.register('budgets', reports.BudgetLineViewSet, basename='budgets')
router.register('ar-allocations', settlement_views.ARAllocationViewSet, basename='ar-allocations')
router.register('ap-allocations', settlement_views.APAllocationViewSet, basename='ap-allocations')
router.register('cost-centers', reports.CostCenterViewSet, basename='cost-centers')
router.register('approval-rules', approval_views.ApprovalRuleViewSet, basename='approval-rules')
router.register('recurring-journals', reports.RecurringJournalViewSet, basename='recurring-journals')

urlpatterns = [
    path('', include(router.urls)),
    path('reports/trial-balance/', views.TrialBalanceView.as_view(), name='trial-balance'),
    path('reports/income-statement/', views.IncomeStatementView.as_view(), name='income-statement'),
    path('reports/balance-sheet/', views.BalanceSheetView.as_view(), name='balance-sheet'),
    path('reports/vat-return/', views.VATReturnView.as_view(), name='vat-return'),
    path('reports/ar-aging/', reports.AgingReportView.as_view(kind='ar'), name='ar-aging'),
    path('reports/ap-aging/', reports.AgingReportView.as_view(kind='ap'), name='ap-aging'),
    path('reports/general-ledger/', reports.GeneralLedgerView.as_view(), name='general-ledger'),
    path('reports/cash-flow/', reports.CashFlowView.as_view(), name='cash-flow'),
    path('reports/budget-vs-actual/', reports.BudgetVsActualView.as_view(), name='budget-vs-actual'),
    path('reports/export/<str:report_id>/', views.ReportExportView.as_view(), name='report-export'),
    path('fx/revalue/', settlement_views.FXRevaluationView.as_view(), name='fx-revalue'),
    path('account-search/', views.UnifiedAccountSearchView.as_view(), name='account-search'),
    path('summary/', views.FinanceSummaryView.as_view(), name='finance-summary'),
]
