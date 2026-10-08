from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
router = DefaultRouter()
# 'compliance' and 'categories' must be registered before '' or 'compliance/' is read as a
# document id and those endpoints can never be reached.
router.register('compliance', views.ComplianceRecordViewSet, basename='compliance')
router.register('categories', views.DocumentCategoryViewSet, basename='document-categories')
router.register('', views.DocumentViewSet, basename='documents')
urlpatterns = [path('', include(router.urls))]
