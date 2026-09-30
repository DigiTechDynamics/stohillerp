"""3-way match actions on supplier invoices (mixed into the finance viewset)."""

from rest_framework.decorators import action
from rest_framework.response import Response

from apps.procurement import services


class InvoiceMatchActions:
    @action(detail=True, methods=['get'])
    def match_status(self, request, pk=None):
        return Response(services.match(self.get_object()))

    @action(detail=True, methods=['post'])
    def override_match(self, request, pk=None):
        return Response(services.override_match(self.get_object(), request.user, request.data.get('reason', '')))
