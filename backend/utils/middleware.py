"""Stohill Properties - Custom Middleware"""
import logging
from django.utils import timezone
logger = logging.getLogger('stohill')

class RequestLoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        start_time = timezone.now()
        response = self.get_response(request)
        duration = (timezone.now() - start_time).total_seconds() * 1000

        # Only audit API requests
        if request.path.startswith('/api/'):
            user = getattr(request, 'user', None)
            user_authenticated = user and user.is_authenticated
            user_str = str(user) if user_authenticated else 'anonymous'
            
            # 1. Standard Console/File Log
            logger.info(f'{request.method} {request.path} | {response.status_code} | {user_str} | {duration:.1f}ms')

            # 2. Permanent Database Audit for State-Changing Actions
            if user_authenticated and request.method in ['POST', 'PATCH', 'PUT', 'DELETE']:
                # Success audits only (or 403/401 for security context)
                if response.status_code < 400 or response.status_code in [401, 403]:
                    self._create_audit_log(request, response)

        return response

    def _create_audit_log(self, request, response):
        from apps.core.models import AuditLog
        
        # Determine the target model from path (simplified mapping)
        path_segments = request.path.strip('/').split('/')
        model_name = path_segments[-2] if len(path_segments) >= 2 else 'unknown'
        
        try:
            AuditLog.objects.create(
                user=request.user,
                action=request.method.lower(),
                model_name=model_name,
                object_id=path_segments[-1] if len(path_segments) > 2 else 'list',
                object_repr=f"{request.method} {request.path}",
                ip_address=self._get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
                changes={'status_code': response.status_code}
            )
        except Exception as e:
            logger.error(f"Failed to create audit log: {str(e)}")

    def _get_client_ip(self, request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip
