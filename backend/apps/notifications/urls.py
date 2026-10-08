from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.notifications.views import MessageViewSet, NotificationViewSet

router = DefaultRouter()
router.register('messages', MessageViewSet, basename='messages')
router.register('inbox', NotificationViewSet, basename='notification-inbox')
urlpatterns = [path('', include(router.urls))]
