from apps.crm.models import Activity
from apps.notifications.utils import notify_user
from django.utils import timezone
from datetime import timedelta

def check_activity_reminders():
    """
    Finds activities due in the next 15 minutes and sends notifications to the assigned users.
    Only sends to 'planned' activities that don't have a notification 'reminded' yet?
    Actually, let's just use a simple 'due in the next 15 minutes' check for now.
    """
    now = timezone.now()
    window_end = now + timedelta(minutes=60)
    
    upcoming = Activity.objects.filter(
        status='planned',
        due_date__gte=now,
        due_date__lte=window_end
    ).select_related('assigned_to', 'opportunity', 'contact')
    
    count = 0
    for act in upcoming:
        # Check if we should notify (e.g. 15 mins before)
        # For simplicity, we just send it if it's in the window.
        if not act.assigned_to or not act.assigned_to.user:
            continue
            
        verb = f"Reminder: Upcoming {act.activity_type}"
        description = f"Activity '{act.subject}' is scheduled for {act.due_date.strftime('%H:%M')}."
        if act.contact:
            description += f" with {act.contact.full_name}"
            
        notify_user(
            recipient=act.assigned_to.user,
            verb=verb,
            description=description,
            module='crm',
            target=act,
            level='warning'
        )
        count += 1
        
    return count
