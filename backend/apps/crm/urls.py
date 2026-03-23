from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
router = DefaultRouter()
router.register('contacts', views.ContactViewSet, basename='contacts')
router.register('opportunities', views.OpportunityViewSet, basename='opportunities')
router.register('pipelines', views.PipelineViewSet, basename='pipelines')
router.register('activities', views.ActivityViewSet, basename='activities')
urlpatterns = [path('', include(router.urls))]
