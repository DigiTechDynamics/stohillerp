"""
Audit trail (UAT GAP-4): who changed what, when, from where.

AuditLogMiddleware records every successful write through the API (create,
update, delete and actions such as approve, post or reverse) as a
core.AuditLog row: the user, the record (model, id and a readable label),
the fields submitted (secrets masked, long values cut) and the IP address.
Sign-ins and sign-outs are recorded by the auth views with `record()`.

Recording never breaks a request: a failure is logged and ignored.
"""

import json
import logging

from django.db import transaction

logger = logging.getLogger('stohill.audit')

API_PREFIX = '/api/v1/'
WRITE_METHODS = {'POST', 'PUT', 'PATCH', 'DELETE'}
# Not business changes, or recorded elsewhere (sign-in/out by the auth views).
SKIP_PREFIXES = ('auth/', 'notifications/inbox/', 'health/', 'payments/')
SENSITIVE = ('password', 'token', 'secret', 'refresh', 'access', 'key', 'pin', 'otp')
MAX_VALUE = 200
LABEL_FIELDS = ('reference', 'invoice_number', 'receipt_reference', 'payment_reference', 'batch_number',
                'lease_number', 'reference_number', 'number', 'code', 'name', 'title', 'full_name', 'email')


def client_ip(request):
    """nginx sets X-Real-IP to the connecting address; X-Forwarded-For is client-controlled."""
    if request is None:
        return None
    return request.META.get('HTTP_X_REAL_IP') or request.META.get('REMOTE_ADDR') or None


def _clean(value, depth=0):
    if isinstance(value, dict):
        if depth > 2:
            return '{...}'
        return {k: ('***' if any(s in str(k).lower() for s in SENSITIVE) else _clean(v, depth + 1))
                for k, v in list(value.items())[:50]}
    if isinstance(value, (list, tuple)):
        return [_clean(v, depth + 1) for v in value[:20]]
    if hasattr(value, 'read') or hasattr(value, 'chunks'):   # uploaded file
        return f'<file {getattr(value, "name", "")}>'
    if isinstance(value, (int, float, bool)) or value is None:
        return value
    text = str(value)
    return text if len(text) <= MAX_VALUE else text[:MAX_VALUE] + '...'


def _submitted(response):
    """The data the client sent, as DRF parsed it (files are reduced to their names by _clean)."""
    drf_request = (getattr(response, 'renderer_context', None) or {}).get('request')
    try:
        data = drf_request.data if drf_request is not None else {}
    except Exception:
        return {}
    if hasattr(data, 'lists'):   # QueryDict from a form or multipart upload
        return {k: (v[0] if len(v) == 1 else v) for k, v in data.lists()}
    return data


def record(request, action, model_name, object_id='', object_repr='', changes=None, user=None):
    from apps.core.models import AuditLog

    try:
        with transaction.atomic():
            AuditLog.objects.create(
                user=user if user is not None else (request.user if getattr(request, 'user', None)
                                                    and request.user.is_authenticated else None),
                action=action, model_name=model_name[:100], object_id=str(object_id or '')[:100],
                object_repr=str(object_repr or '')[:500], changes=_clean(changes or {}),
                ip_address=client_ip(request), user_agent=(request.META.get('HTTP_USER_AGENT', '') if request else '')[:500],
            )
    except Exception:
        logger.exception('Could not write audit log for %s %s', action, model_name)


def _action_for(request, url_name):
    from apps.core.models import AuditLog

    A = AuditLog.ActionType
    if request.method == 'DELETE':
        return A.DELETE, ''
    if request.method in ('PUT', 'PATCH'):
        return A.UPDATE, ''
    if url_name.endswith('-list'):
        return A.CREATE, ''
    custom = url_name.rsplit('-', 1)[-1] if '-' in url_name else url_name
    if 'approve' in custom:
        return A.APPROVE, custom
    if 'reject' in custom or 'decline' in custom:
        return A.REJECT, custom
    if custom.startswith('post') or custom.endswith('post') or custom in ('post_batch', 'post_invoice'):
        return A.POST, custom
    if 'export' in custom:
        return A.EXPORT, custom
    if custom == 'list':
        return A.CREATE, ''
    return A.UPDATE, custom


class AuditLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        try:
            self._maybe_record(request, response)
        except Exception:
            logger.exception('Audit middleware failed for %s', request.path)
        return response

    def _maybe_record(self, request, response):
        if request.method not in WRITE_METHODS or not request.path.startswith(API_PREFIX):
            return
        if not (200 <= response.status_code < 300):
            return
        rel = request.path[len(API_PREFIX):]
        if rel.startswith(SKIP_PREFIXES):
            return
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return
        match = getattr(request, 'resolver_match', None)
        url_name = (match.url_name or '') if match else ''
        view_cls = getattr(getattr(match, 'func', None), 'cls', None) if match else None
        queryset = getattr(view_cls, 'queryset', None)
        model = queryset.model if queryset is not None else None
        model_name = model._meta.verbose_name.title() if model is not None else (rel.split('/')[0] or 'API').title()

        data = getattr(response, 'data', None)
        object_id = (match.kwargs.get('pk') if match else '') or (data.get('id') if isinstance(data, dict) else '') or ''
        label = ''
        if isinstance(data, dict):
            label = next((str(data[f]) for f in LABEL_FIELDS if data.get(f)), '')
        if not label and model is not None and object_id and request.method != 'DELETE':
            try:
                label = str(model._default_manager.filter(pk=object_id).first() or '')
            except Exception:
                label = ''

        action, custom = _action_for(request, url_name)
        submitted = _submitted(response)
        changes = dict(submitted) if isinstance(submitted, dict) else {'data': submitted}
        if custom:
            changes = {'action': custom, **changes}
        record(request, action, model_name, object_id, label, changes, user=user)
