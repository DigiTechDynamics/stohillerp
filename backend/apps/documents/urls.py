from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
router = DefaultRouter()
router.register('workspaces', views.DocumentWorkspaceViewSet, basename='workspaces')
router.register('categories', views.DocumentCategoryViewSet, basename='categories')
router.register('tags', views.DocumentTagViewSet, basename='tags')
router.register('compliance', views.ComplianceRecordViewSet, basename='compliance')
router.register('', views.DocumentViewSet, basename='documents')
urlpatterns = [path('', include(router.urls))]
