"""Stohil Properties - Custom Middleware"""
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
        if request.path.startswith('/api/'):
            user = getattr(request, 'user', None)
            user_str = str(user) if user and user.is_authenticated else 'anonymous'
            logger.info(f'{request.method} {request.path} | {response.status_code} | {user_str} | {duration:.1f}ms')
        return response
