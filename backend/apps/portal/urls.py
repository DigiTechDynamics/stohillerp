from django.urls import path

from apps.portal import views

urlpatterns = [
    path('me/', views.PortalMeView.as_view(), name='portal-me'),
    path('invoices/', views.PortalInvoicesView.as_view(), name='portal-invoices'),
    path('invoices/<uuid:pk>/pdf/', views.PortalInvoicePdfView.as_view(), name='portal-invoice-pdf'),
    path('statement/', views.PortalStatementView.as_view(), name='portal-statement'),
    path('maintenance/', views.PortalMaintenanceView.as_view(), name='portal-maintenance'),
    path('payments/', views.PortalPaymentsView.as_view(), name='portal-payments'),
    path('payments/<str:reference>/', views.PortalPaymentDetailView.as_view(), name='portal-payment'),
    path('payments/<str:reference>/<str:op>/', views.PortalPaymentDetailView.as_view(), name='portal-payment-op'),
]
