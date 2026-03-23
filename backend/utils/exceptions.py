"""Stohil Properties - Custom Exception Handler"""
from rest_framework.views import exception_handler
from rest_framework.response import Response
import logging
logger = logging.getLogger('stohill')

def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is not None:
        view = context.get('view', None)
        response.data = {
            'success': False,
            'error': {
                'status_code': response.status_code,
                'message': response.data,
                'view': view.__class__.__name__ if view else None,
            }
        }
    return response
