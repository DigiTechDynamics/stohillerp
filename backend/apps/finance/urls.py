from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
router = DefaultRouter()
router.register('accounts', views.ChartOfAccountViewSet, basename='coa')
router.register('journals', views.JournalViewSet, basename='journals')
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

urlpatterns = [
    path('', include(router.urls)),
    path('reports/trial-balance/', views.TrialBalanceView.as_view(), name='trial-balance'),
    path('reports/income-statement/', views.IncomeStatementView.as_view(), name='income-statement'),
    path('reports/balance-sheet/', views.BalanceSheetView.as_view(), name='balance-sheet'),
    path('reports/vat-return/', views.VATReturnView.as_view(), name='vat-return'),
    path('reports/export/<str:report_id>/', views.ReportExportView.as_view(), name='report-export'),
    path('account-search/', views.UnifiedAccountSearchView.as_view(), name='account-search'),
]
