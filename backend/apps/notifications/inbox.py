"""
In-app notifications: the messages under the bell in the top bar.

    notify(user_or_users, 'Batch JB-0012 waits for approval', link='/finance/approvals')
    notify_module('finance_gl', 'Batch JB-0012 waits for approval', exclude=maker)
    notify_role(role, ...)

Recipients are active staff logins; tenant, owner and contractor logins never
get in-app notifications. A notification with the same recipient, category and
related_object as one that is still unread is refreshed instead of duplicated,
so a daily job that re-raises the same alert does not pile up copies.

Failures are logged, never raised: a notification must not roll back the
business action that triggered it.
"""

import logging

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.notifications.models import Notification

logger = logging.getLogger('stohill.notifications')


def _staff(users):
    from apps.core.models import User
    qs = users if hasattr(users, 'filter') else User.objects.filter(pk__in=[u.pk for u in users if u])
    return [u for u in qs.filter(is_active=True).exclude(status=User.UserStatus.SUSPENDED).prefetch_related('roles')
            if not u.is_portal_only]


def notify(users, title, body='', *, link='', level=Notification.Level.INFO, category='', related='', exclude=None):
    """Create a notification for each user (a User, a list of users or a queryset). Returns the count."""
    if users is None:
        return 0
    if not isinstance(users, (list, tuple, set)) and not hasattr(users, 'filter'):
        users = [users]
    excluded = {u.pk for u in (exclude if isinstance(exclude, (list, tuple, set)) else [exclude]) if u}
    try:
        with transaction.atomic():
            count = 0
            for user in _staff(users):
                if user.pk in excluded:
                    continue
                existing = None
                if related:
                    existing = Notification.objects.filter(recipient=user, category=category, related_object=related,
                                                           read_at__isnull=True).first()
                if existing:
                    existing.title, existing.body, existing.link, existing.level = title[:200], body, link[:300], level
                    existing.created_at = timezone.now()
                    existing.save(update_fields=['title', 'body', 'link', 'level', 'created_at'])
                else:
                    Notification.objects.create(recipient=user, title=title[:200], body=body, link=link[:300],
                                                level=level, category=category, related_object=related[:100])
                count += 1
            return count
    except Exception:  # never break the caller's transaction for a notification
        logger.exception('Could not create notification %r', title)
        return 0


def module_users(module_code):
    """Active staff whose roles grant the module, plus super admins."""
    from apps.core.models import Role, User
    return User.objects.filter(
        Q(is_superuser=True) | Q(roles__role_type=Role.RoleType.SUPER_ADMIN) | Q(roles__modules__code=module_code)
    ).distinct()


def notify_module(module_code, title, body='', **kwargs):
    return notify(module_users(module_code), title, body, **kwargs)


def notify_role(role, title, body='', **kwargs):
    from apps.core.models import Role, User
    users = User.objects.filter(Q(roles=role) | Q(roles__role_type=Role.RoleType.SUPER_ADMIN) | Q(is_superuser=True))
    return notify(users.distinct(), title, body, **kwargs)


def resolve(category, related):
    """Mark notifications about a subject read for everyone, e.g. once a batch is approved."""
    return Notification.objects.filter(category=category, related_object=related, read_at__isnull=True) \
        .update(read_at=timezone.now())
