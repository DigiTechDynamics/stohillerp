"""
  GET notifications/messages/   ?contact=&category=&channel=&status=   message history
"""
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, serializers, viewsets

from apps.notifications.models import Message


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
