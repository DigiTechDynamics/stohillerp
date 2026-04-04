import os
import django
import sys
from datetime import timedelta
from django.utils import timezone

# Setup Django
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'backend')))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.crm.models import Activity, Contact
from apps.core.models import User
from apps.notifications.models import Notification
from apps.crm.tasks import check_activity_reminders

def verify_activity_reminders():
    print("--- 🚀 CRM Activity Reminders Verification ---")
    
    # Cleanup old test data
    Activity.objects.filter(subject__contains="🚀 Automated Test").delete()
    
    # Setup test data
    from apps.hr.models import Employee
    employee = Employee.objects.filter(user__isnull=False).first()
    if not employee:
        print("❌ No employees with users found. Creating a temp one...")
        from apps.core.models import User
        user = User.objects.first()
        if not user:
             user = User.objects.create_user(username="testuser", email="test@example.com", password="password")
        
        employee = Employee.objects.create(
            user=user,
            first_name="Test",
            last_name="Agent",
            employee_number="EMP-TEST-99",
            email="test@example.com",
            start_date=timezone.now().date()
        )
        
    user = employee.user
    contact = Contact.objects.first()
    
    # Create an upcoming activity (due in 30 mins)
    due_at = timezone.now() + timedelta(minutes=30)
    act = Activity.objects.create(
        subject="🚀 Automated Test Viewing",
        activity_type='viewing',
        status='planned',
        due_date=due_at,
        assigned_to=employee,
        contact=contact
    )
    print(f"✅ Created planned activity: '{act.subject}' due at {act.due_date.strftime('%H:%M')} (Assigned to: {employee.full_name})")
    
    # Run the reminder task
    print("🕒 Running check_activity_reminders()...")
    count = check_activity_reminders()
    print(f"📊 Reminders triggered: {count}")
    
    # Verify notification created
    notif = Notification.objects.filter(recipient=user, module='crm', verb__contains='Reminder').order_by('-created_at').first()
    if notif and notif.created_at >= timezone.now() - timedelta(seconds=10):
        print(f"🔔 Notification VERIFIED: {notif.verb} for {user.email}")
        print(f"📝 Description: {notif.description}")
    else:
        print("❌ Notification NOT FOUND or delayed.")
        
    print("--- ✅ CRM Activity Reminders Verification COMPLETE ---")

if __name__ == "__main__":
    verify_activity_reminders()
