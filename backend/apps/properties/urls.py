from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
router = DefaultRouter()
# Fixed prefixes must come before '' or they are read as a property id.
router.register('types', views.PropertyTypeViewSet, basename='property-types')
router.register('units', views.PropertyUnitViewSet, basename='property-units')
router.register('images', views.PropertyImageViewSet, basename='property-images')
router.register('valuations', views.PropertyValuationViewSet, basename='property-valuations')
router.register('inspections', views.PropertyInspectionViewSet, basename='property-inspections')
router.register('inspection-items', views.InspectionItemViewSet, basename='inspection-items')
router.register('portfolios', views.PortfolioViewSet, basename='portfolios')
router.register('ownerships', views.PropertyOwnershipViewSet, basename='property-ownerships')
router.register('custom-fields', views.CustomFieldDefinitionViewSet, basename='custom-fields')
router.register('', views.PropertyViewSet, basename='properties')
urlpatterns = [path('', include(router.urls))]
