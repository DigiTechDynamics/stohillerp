"""
Stohill Properties - URL Configuration
Central URL routing for all API modules.
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView

from apps.core.auth_views import LogoutView, ThrottledTokenObtainPairView
from apps.core.health import health
from apps.portal.views import PaynowResultView, PortalActivateView

# ─── API v1 Routes ─────────────────────────────────────────────────────────────
api_v1_patterns = [
    # Health (unauthenticated; used by Docker / load balancers)
    path('health/', health, name='health'),

    # Authentication
    path('auth/login/', ThrottledTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/logout/', LogoutView.as_view(), name='token_logout'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/verify/', TokenVerifyView.as_view(), name='token_verify'),
    path('auth/portal-activate/', PortalActivateView.as_view(), name='portal-activate'),

    # Core (users, roles, permissions)
    path('core/', include('apps.core.urls')),

    # Module APIs
    path('properties/', include('apps.properties.urls')),
    path('crm/', include('apps.crm.urls')),
    path('sales/', include('apps.sales.urls')),
    path('rentals/', include('apps.rentals.urls')),
    path('finance/', include('apps.finance.urls')),
    path('commissions/', include('apps.commissions.urls')),
    path('documents/', include('apps.documents.urls')),
    path('hr/', include('apps.hr.urls')),
    path('fixed-assets/', include('apps.fixed_assets.urls')),
    path('banking/', include('apps.banking.urls')),
    path('payroll/', include('apps.payroll.urls')),
    path('procurement/', include('apps.procurement.urls')),
    path('projects/', include('apps.projects.urls')),
    path('portal/', include('apps.portal.urls')),
    path('payments/paynow/result/', PaynowResultView.as_view(), name='paynow-result'),
    path('dashboard/', include('apps.dashboard.urls')),
]

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/v1/', include(api_v1_patterns)),
]

# Serve media in development
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

# Customize admin
admin.site.site_header = 'Stohill Properties Administration'
admin.site.site_title = 'Stohill Properties'
admin.site.index_title = 'Property Management System'
