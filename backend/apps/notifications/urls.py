from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.notifications.views import MessageViewSet

router = DefaultRouter()
router.register('messages', MessageViewSet, basename='messages')
urlpatterns = [path('', include(router.urls))]
