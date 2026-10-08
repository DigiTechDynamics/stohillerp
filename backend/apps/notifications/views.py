"""
  GET notifications/messages/   ?contact=&category=&channel=&status=   message history

  The signed-in user's in-app notifications (only ever their own):
  GET  notifications/inbox/                 ?unread=true
  GET  notifications/inbox/unread-count/
  POST notifications/inbox/{id}/read/
  POST notifications/inbox/read-all/
"""
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, serializers, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.notifications.models import Message, Notification


class MessageSerializer(serializers.ModelSerializer):
    contact_name = serializers.CharField(source='contact.full_name', read_only=True, default=None)

    class Meta:
        model = Message
        fields = ['id', 'channel', 'recipient', 'subject', 'body', 'status', 'error', 'provider', 'contact',
                  'contact_name', 'category', 'related_object', 'created_at']


class MessageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Message.objects.select_related('contact')
    serializer_class = MessageSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['contact', 'category', 'channel', 'status']
    search_fields = ['recipient', 'subject', 'related_object']


class NotificationSerializer(serializers.ModelSerializer):
    is_read = serializers.BooleanField(read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'title', 'body', 'link', 'level', 'category', 'is_read', 'read_at', 'created_at']


class NotificationViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.DestroyModelMixin,
                          viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    filter_backends = []

    def get_queryset(self):
        qs = Notification.objects.filter(recipient=self.request.user)
        unread = self.request.query_params.get('unread')
        if unread in ('1', 'true', 'True'):
            qs = qs.filter(read_at__isnull=True)
        return qs

    @action(detail=False, methods=['get'], url_path='unread-count')
    def unread_count(self, request):
        return Response({'count': Notification.objects.filter(recipient=request.user, read_at__isnull=True).count()})

    @action(detail=True, methods=['post'])
    def read(self, request, pk=None):
        notification = self.get_object()
        if notification.read_at is None:
            notification.read_at = timezone.now()
            notification.save(update_fields=['read_at'])
        return Response(self.get_serializer(notification).data)

    @action(detail=False, methods=['post'], url_path='read-all')
    def read_all(self, request):
        updated = Notification.objects.filter(recipient=request.user, read_at__isnull=True).update(read_at=timezone.now())
        return Response({'marked_read': updated})
