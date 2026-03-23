"""Stohil Properties - CRM Views"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count, Sum

from apps.crm.models import Contact, Opportunity, Pipeline, PipelineStage, Activity


class ContactViewSet(viewsets.ModelViewSet):
    queryset = Contact.objects.select_related('assigned_agent').order_by('last_name')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['contact_type', 'status', 'rating', 'assigned_agent']
    search_fields = ['first_name', 'last_name', 'email', 'phone_mobile', 'company']
    ordering_fields = ['first_name', 'last_name', 'company', 'created_at']

    def get_serializer_class(self):
        from apps.crm.serializers import ContactSerializer
        return ContactSerializer


class OpportunityViewSet(viewsets.ModelViewSet):
    queryset = Opportunity.objects.select_related('contact', 'property', 'stage', 'assigned_agent')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['pipeline', 'stage', 'priority', 'assigned_agent']
    search_fields = ['title', 'reference', 'contact__first_name', 'contact__last_name']

    def get_serializer_class(self):
        from apps.crm.serializers import OpportunitySerializer
        return OpportunitySerializer

    @action(detail=False, methods=['get'])
    def kanban(self, request):
        """Returns opportunities grouped by pipeline stage for Kanban view."""
        pipeline_id = request.query_params.get('pipeline')
        stages_qs = PipelineStage.objects.filter(is_terminal=False).order_by('position')
        if pipeline_id:
            stages_qs = stages_qs.filter(pipeline_id=pipeline_id)

        result = []
        for stage in stages_qs:
            opps = Opportunity.objects.filter(stage=stage).select_related('contact', 'property')
            result.append({
                'stage_id': str(stage.id),
                'stage_name': stage.name,
                'stage_type': stage.stage_type,
                'color': stage.color,
                'probability': stage.probability,
                'opportunities': [
                    {
                        'id': str(o.id),
                        'title': o.title,
                        'reference': o.reference,
                        'contact_name': o.contact.full_name if o.contact else '',
                        'property_ref': o.property.reference_number if o.property else '',
                        'expected_value': str(o.expected_value or 0),
                        'priority': o.priority,
                        'expected_close_date': str(o.expected_close_date) if o.expected_close_date else None,
                    }
                    for o in opps
                ]
            })
        return Response(result)

    @action(detail=True, methods=['post'])
    def move_stage(self, request, pk=None):
        """Move an opportunity to a different stage."""
        opp = self.get_object()
        stage_id = request.data.get('stage_id')
        try:
            stage = PipelineStage.objects.get(id=stage_id)
            opp.stage = stage
            opp.probability = stage.probability
            opp.save(update_fields=['stage', 'probability'])
            return Response({'status': 'moved', 'new_stage': stage.name})
        except PipelineStage.DoesNotExist:
            return Response({'error': 'Stage not found'}, status=404)


class PipelineViewSet(viewsets.ModelViewSet):
    queryset = Pipeline.objects.prefetch_related('stages')
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        from apps.crm.serializers import PipelineSerializer
        return PipelineSerializer


class ActivityViewSet(viewsets.ModelViewSet):
    queryset = Activity.objects.select_related('contact', 'opportunity', 'assigned_to')
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['activity_type', 'status', 'assigned_to', 'contact']

    def get_serializer_class(self):
        from apps.crm.serializers import ActivitySerializer
        return ActivitySerializer
