from rest_framework import serializers
from apps.notifications.models import Notification

class NotificationSerializer(serializers.ModelSerializer):
    actor_name = serializers.ReadOnlyField(source='actor.full_name', default='System')
    actor_avatar = serializers.SerializerMethodField()
    target_repr = serializers.SerializerMethodField()
    
    class Meta:
        model = Notification
        fields = [
            'id', 'recipient', 'actor', 'actor_name', 'actor_avatar', 
            'verb', 'description', 'target_content_type', 'target_object_id', 
            'target_repr', 'level', 'is_read', 'module', 'link', 
            'created_at', 'updated_at'
        ]
        read_only_fields = ['recipient', 'actor', 'actor_name', 'actor_avatar', 'target_repr', 'created_at']

    def get_actor_avatar(self, obj):
        if obj.actor and obj.actor.avatar:
            return obj.actor.avatar.url
        return None

    def get_target_repr(self, obj):
        """Returns string representation of target object (e.g. 'INV-001')"""
        if obj.target:
            return str(obj.target)
        return None
