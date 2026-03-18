from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
router = DefaultRouter()
router.register('types', views.PropertyTypeViewSet, basename='property-types')
router.register('', views.PropertyViewSet, basename='properties')
urlpatterns = [path('', include(router.urls))]
