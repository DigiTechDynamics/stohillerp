from apps.notifications.models import Notification

def notify_user(recipient, verb, actor=None, target=None, level='info', description='', module='', link=''):
    """
    Helper function to create a notification for a user.
    """
    if not recipient:
        return None
        
    return Notification.objects.create(
        recipient=recipient,
        actor=actor,
        verb=verb,
        target=target,
        level=level,
        description=description,
        module=module,
        link=link
    )
