"""
Authenticated download of private uploads (KYC and other documents).

nginx refuses the private folders under /media/, so these files are only
reachable through an API action that has already passed authentication and
module access. In production the API answers with X-Accel-Redirect and nginx
streams the file from an `internal` location; elsewhere Django streams it.
"""

import mimetypes
import os
from urllib.parse import quote

from django.conf import settings
from django.http import FileResponse, Http404, HttpResponse

# Upload folders (FileField upload_to prefixes) that must never be public.
PRIVATE_PREFIXES = ('documents/', 'crm/documents/', 'crm/attachments/', 'inspections/')


def private_file_response(field_file, download_name=None):
    if not field_file or not field_file.name:
        raise Http404('No file attached.')
    name = field_file.name
    filename = download_name or os.path.basename(name)
    disposition = f"attachment; filename*=UTF-8''{quote(filename)}"

    accel_prefix = getattr(settings, 'PRIVATE_MEDIA_ACCEL_PREFIX', '')
    if accel_prefix:
        response = HttpResponse()
        response['X-Accel-Redirect'] = f'{accel_prefix}{quote(name)}'
        response['Content-Type'] = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
    else:
        try:
            response = FileResponse(field_file.open('rb'))
        except FileNotFoundError:
            raise Http404('File missing from storage.')
        response['Content-Type'] = mimetypes.guess_type(filename)[0] or 'application/octet-stream'
    response['Content-Disposition'] = disposition
    response['X-Content-Type-Options'] = 'nosniff'
    response['Cache-Control'] = 'private, no-store'
    return response
