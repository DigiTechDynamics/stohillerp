"""Stohil Properties - CRM Views (Odoo CRM parity)"""
from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Count, Sum, Avg, Q, Prefetch
from django.utils import timezone
from datetime import timedelta
import calendar

from apps.crm.models import (
    Contact, Opportunity, Pipeline, PipelineStage,
    Activity, CrmTag, CrmNote, LostReason, EmailTemplate,
    SalesTeam, ContactDocument
)
from apps.crm.serializers import (
    ContactSerializer, OpportunitySerializer, PipelineSerializer,
    PipelineStageSerializer, ActivitySerializer, CrmNoteSerializer,
    CrmTagSerializer, LostReasonSerializer, EmailTemplateSerializer,
    SalesTeamSerializer, ContactDocumentSerializer
)
from utils.private_media import private_file_response
from utils.queries import subquery_count
from apps.portal.views import InviteToPortalActions


# ─────────────────────────────────────────────────────────────────────────────
# Sales Team
# ─────────────────────────────────────────────────────────────────────────────

class SalesTeamViewSet(viewsets.ModelViewSet):
    queryset = SalesTeam.objects.all()
    serializer_class = SalesTeamSerializer
    pagination_class = None


# ─────────────────────────────────────────────────────────────────────────────
# Contact
# ─────────────────────────────────────────────────────────────────────────────

class ContactViewSet(InviteToPortalActions, viewsets.ModelViewSet):
    queryset = Contact.objects.select_related('assigned_agent', 'sales_team').order_by('last_name')

    def get_queryset(self):
        # Counts and active leases in the list query, not one query each per contact.
        from apps.documents.models import Document
        from apps.rentals.models import Lease

        qs = super().get_queryset()
        if self.request.query_params.get('tenants') == '1':
            # Rental Management's tenant list: filed as tenants, or holding a lease whatever their type.
            qs = qs.filter(Q(contact_type=Contact.ContactType.TENANT) | Q(leases__isnull=False)).distinct()
        if self.request.query_params.get('owners') == '1':
            # Property owners: filed as landlords or investors, or already owning (a share of) a property.
            qs = qs.filter(Q(contact_type__in=[Contact.ContactType.LANDLORD, Contact.ContactType.INVESTOR])
                           | Q(owned_properties__isnull=False) | Q(property_shares__isnull=False)).distinct()
        return qs.annotate(
            n_opportunities=subquery_count(Opportunity, 'contact'),
            n_documents=subquery_count(Document, 'contact'),
        ).prefetch_related(Prefetch('leases', to_attr='active_lease_list',
                                    queryset=Lease.objects.filter(status='active').select_related('property')))
    serializer_class = ContactSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['contact_type', 'status', 'rating', 'assigned_agent', 'sales_team']
    search_fields = ['first_name', 'last_name', 'email', 'phone_mobile', 'company']
    ordering_fields = ['first_name', 'last_name', 'company', 'created_at', 'lead_score', 'last_activity_at']

    @action(detail=False, methods=['get'])
    def duplicate_check(self, request):
        """Check if a contact with the given email or name already exists."""
        email = request.query_params.get('email', '').strip()
        name = request.query_params.get('name', '').strip()

        duplicates = []
        if email:
            qs = Contact.objects.filter(email__iexact=email)
            for c in qs:
                duplicates.append({'id': str(c.id), 'name': c.full_name, 'email': c.email, 'field': 'email'})
        if name and not duplicates:
            parts = name.split()
            if len(parts) >= 2:
                qs = Contact.objects.filter(first_name__iexact=parts[0], last_name__iexact=parts[-1])
                for c in qs:
                    duplicates.append({'id': str(c.id), 'name': c.full_name, 'email': c.email, 'field': 'name'})

        return Response({'duplicates': duplicates, 'has_duplicates': len(duplicates) > 0})

    @action(detail=True, methods=['post'])
    def recompute_score(self, request, pk=None):
        """Recompute and save the lead score for this contact."""
        contact = self.get_object()
        score = contact.compute_lead_score()
        contact.lead_score = score
        contact.save(update_fields=['lead_score'])
        return Response({'lead_score': score})


class ContactDocumentViewSet(viewsets.ModelViewSet):
    queryset = ContactDocument.objects.select_related('contact', 'verified_by')
    serializer_class = ContactDocumentSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['contact', 'document_type', 'is_verified']

    @action(detail=True, methods=['post'])
    def verify(self, request, pk=None):
        doc = self.get_object()
        doc.is_verified = True
        doc.verified_by = request.user
        doc.save()
        return Response({'status': 'verified'})

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        return private_file_response(self.get_object().file)


# ─────────────────────────────────────────────────────────────────────────────
# Tags
# ─────────────────────────────────────────────────────────────────────────────

class CrmTagViewSet(viewsets.ModelViewSet):
    queryset = CrmTag.objects.all()
    serializer_class = CrmTagSerializer
    pagination_class = None


# ─────────────────────────────────────────────────────────────────────────────
# Lost Reasons
# ─────────────────────────────────────────────────────────────────────────────

class LostReasonViewSet(viewsets.ModelViewSet):
    """Active reasons for the lost-deal picker; ?all=1 includes retired ones (settings page)."""
    queryset = LostReason.objects.all()
    serializer_class = LostReasonSerializer
    pagination_class = None

    def get_queryset(self):
        qs = super().get_queryset()
        if self.action == 'list' and self.request.query_params.get('all') != '1':
            qs = qs.filter(is_active=True)
        return qs


# ─────────────────────────────────────────────────────────────────────────────
# Email Templates
# ─────────────────────────────────────────────────────────────────────────────

class EmailTemplateViewSet(viewsets.ModelViewSet):
    queryset = EmailTemplate.objects.all().order_by('name')
    serializer_class = EmailTemplateSerializer
    pagination_class = None

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


# ─────────────────────────────────────────────────────────────────────────────
# Opportunity / Lead
# ─────────────────────────────────────────────────────────────────────────────

class OpportunityViewSet(viewsets.ModelViewSet):
    queryset = Opportunity.objects.select_related(
        'contact', 'property', 'stage', 'assigned_agent', 'lost_reason', 'pipeline', 'sales_team'
    ).prefetch_related('tags', 'opportunity_activities', 'opportunity_notes')
    serializer_class = OpportunitySerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['pipeline', 'stage', 'priority', 'assigned_agent', 'is_lead', 'sales_team']
    search_fields = ['title', 'reference', 'contact__first_name', 'contact__last_name', 'contact_name', 'email_from']
    ordering_fields = ['created_at', 'expected_revenue', 'expected_closing', 'probability', 'last_activity_at']

    def _notify_assignment(self, opp, previous_agent_id=None):
        if not opp.assigned_agent_id or opp.assigned_agent_id == previous_agent_id:
            return
        from apps.notifications.inbox import notify
        kind = 'lead' if opp.is_lead else 'opportunity'
        notify(opp.assigned_agent.user, f'New {kind} assigned to you: {opp.title}',
               f'{opp.reference}. Assigned by {self.request.user.full_name}.', link='/crm',
               level='action', category='crm_assignment', related=f'opportunity:{opp.pk}', exclude=self.request.user)

    def perform_create(self, serializer):
        self._notify_assignment(serializer.save())

    def perform_update(self, serializer):
        previous = serializer.instance.assigned_agent_id
        self._notify_assignment(serializer.save(), previous)

    @action(detail=False, methods=['get'])
    def kanban(self, request):
        """Returns opportunities grouped by pipeline stage for Kanban view."""
        pipeline_id = request.query_params.get('pipeline')
        is_lead = request.query_params.get('is_lead') == 'true'

        # Filter params passed through from frontend filter panel
        priority = request.query_params.get('priority')
        assigned_agent = request.query_params.get('assigned_agent')
        sales_team = request.query_params.get('sales_team')
        tag_ids = request.query_params.getlist('tags')

        stages_qs = PipelineStage.objects.filter(is_terminal=False).order_by('position')
        if pipeline_id:
            stages_qs = stages_qs.filter(pipeline_id=pipeline_id)

        result = []
        for stage in stages_qs:
            opps = Opportunity.objects.filter(
                stage=stage, is_lead=is_lead
            ).select_related('contact', 'property').prefetch_related('opportunity_activities', 'tags')

            # Apply optional filters
            if priority:
                opps = opps.filter(priority=priority)
            if assigned_agent:
                opps = opps.filter(assigned_agent_id=assigned_agent)
            if sales_team:
                opps = opps.filter(sales_team_id=sales_team)
            if tag_ids:
                opps = opps.filter(tags__id__in=tag_ids).distinct()

            total_revenue = opps.aggregate(total=Sum('expected_revenue'))['total'] or 0
            count = opps.count()

            stage_opps = []
            for o in opps:
                last_act = o.opportunity_activities.order_by('-created_at').first()
                next_act = o.opportunity_activities.filter(status='planned').order_by('due_date').first()
                stage_opps.append({
                    'id': str(o.id),
                    'title': o.title,
                    'reference': o.reference,
                    'contact_display': o.contact.full_name if o.contact else (o.contact_name or o.email_from or "Unnamed Lead"),
                    'property_ref': o.property.reference_number if o.property else '',
                    'expected_revenue': str(o.expected_revenue or 0),
                    'priority': o.priority,
                    'probability': o.probability,
                    'tags': [{'id': str(t.id), 'name': t.name, 'color': t.color} for t in o.tags.all()],
                    'lead_score': o.contact.lead_score if o.contact else 0,
                    'rating': o.contact.rating if o.contact else None,
                    'is_stale': o.is_stale,
                    'last_activity': {
                        'subject': last_act.subject,
                        'type': last_act.activity_type,
                        'date': str(last_act.created_at.date()) if last_act and last_act.created_at else None
                    } if last_act else None,
                    'next_activity': {
                        'subject': next_act.subject,
                        'type': next_act.activity_type,
                        'due_date': str(next_act.due_date) if next_act and next_act.due_date else None,
                        'is_overdue': next_act.due_date < timezone.now() if next_act and next_act.due_date else False,
                    } if next_act else None,
                })

            result.append({
                'stage_id': str(stage.id),
                'stage_name': stage.name,
                'stage_type': stage.stage_type,
                'color': stage.color,
                'probability': stage.probability,
                'total_revenue': str(total_revenue),
                'count': count,
                'opportunities': stage_opps
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
            if stage.probability > 0:
                opp.probability = stage.probability
            opp.save(update_fields=['stage', 'probability', 'stage_entered_at'])
            return Response({'status': 'moved', 'new_stage': stage.name, 'probability': opp.probability})
        except PipelineStage.DoesNotExist:
            return Response({'error': 'Stage not found'}, status=404)

    @action(detail=True, methods=['post'])
    def convert_to_opportunity(self, request, pk=None):
        """Convert a lead to an opportunity."""
        lead = self.get_object()
        if not lead.is_lead:
            return Response({'error': 'Already an opportunity'}, status=400)
        partner_id = request.data.get('contact_id')
        lead.convert_to_opportunity(partner_id=partner_id)
        return Response({'status': 'converted', 'is_lead': False})

    @action(detail=True, methods=['post'])
    def mark_won(self, request, pk=None):
        """Mark this opportunity as Won."""
        opp = self.get_object()
        opp.mark_won()
        return Response({'status': 'won', 'probability': 100, 'date_closed': opp.date_closed})

    @action(detail=True, methods=['post'])
    def mark_lost(self, request, pk=None):
        """Mark this opportunity as Lost with an optional reason."""
        opp = self.get_object()
        reason_id = request.data.get('reason_id')
        reason_text = request.data.get('reason_text', '')
        reason = None
        if reason_id:
            try:
                reason = LostReason.objects.get(id=reason_id)
            except LostReason.DoesNotExist:
                pass
        opp.mark_lost(reason=reason, reason_text=reason_text)
        return Response({
            'status': 'lost',
            'probability': 0,
            'lost_reason': reason.name if reason else reason_text,
            'date_closed': opp.date_closed,
        })

    @action(detail=False, methods=['post'])
    def bulk_action(self, request):
        """
        Perform bulk actions on multiple opportunities.
        Supported actions: reassign, add_tag, delete
        """
        ids = request.data.get('ids', [])
        action_type = request.data.get('action')

        if not ids or not action_type:
            return Response({'error': 'ids and action are required'}, status=400)

        opps = Opportunity.objects.filter(id__in=ids)
        count = opps.count()

        if action_type == 'reassign':
            agent_id = request.data.get('agent_id')
            opps.update(assigned_agent_id=agent_id)
            return Response({'status': 'reassigned', 'count': count})

        elif action_type == 'add_tag':
            tag_id = request.data.get('tag_id')
            try:
                tag = CrmTag.objects.get(id=tag_id)
                for opp in opps:
                    opp.tags.add(tag)
                return Response({'status': 'tagged', 'count': count})
            except CrmTag.DoesNotExist:
                return Response({'error': 'Tag not found'}, status=404)

        elif action_type == 'delete':
            opps.delete()
            return Response({'status': 'deleted', 'count': count})

        elif action_type == 'mark_won':
            for opp in opps:
                opp.mark_won()
            return Response({'status': 'won', 'count': count})

        elif action_type == 'mark_lost':
            reason_id = request.data.get('reason_id')
            reason = LostReason.objects.filter(id=reason_id).first() if reason_id else None
            for opp in opps:
                opp.mark_lost(reason=reason)
            return Response({'status': 'lost', 'count': count})

        return Response({'error': f'Unknown action: {action_type}'}, status=400)

    @action(detail=False, methods=['get'])
    def duplicate_check(self, request):
        """Check if an opportunity with same email_from exists."""
        email = request.query_params.get('email', '').strip()
        if not email:
            return Response({'duplicates': [], 'has_duplicates': False})
        opps = Opportunity.objects.filter(
            Q(email_from__iexact=email) | Q(contact__email__iexact=email)
        ).select_related('contact', 'stage')[:5]
        results = [{
            'id': str(o.id),
            'title': o.title,
            'stage': o.stage.name,
            'contact': o.contact.full_name if o.contact else o.contact_name,
        } for o in opps]
        return Response({'duplicates': results, 'has_duplicates': len(results) > 0})


# ─────────────────────────────────────────────────────────────────────────────
# Pipeline & Stages
# ─────────────────────────────────────────────────────────────────────────────

class PipelineViewSet(viewsets.ModelViewSet):
    queryset = Pipeline.objects.prefetch_related('stages')
    serializer_class = PipelineSerializer
    pagination_class = None


class PipelineStageViewSet(viewsets.ModelViewSet):
    queryset = PipelineStage.objects.select_related('pipeline').order_by('pipeline__name', 'position')
    serializer_class = PipelineStageSerializer
    pagination_class = None
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['pipeline']


# ─────────────────────────────────────────────────────────────────────────────
# Activity
# ─────────────────────────────────────────────────────────────────────────────

class ActivityViewSet(viewsets.ModelViewSet):
    queryset = Activity.objects.select_related('opportunity', 'assigned_to', 'email_template')
    serializer_class = ActivitySerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = {'activity_type': ['exact'], 'status': ['exact'], 'assigned_to': ['exact'],
                        'opportunity': ['exact'], 'contact': ['exact'], 'due_date': ['gte', 'lte']}
    search_fields = ['subject', 'description']
    ordering_fields = ['due_date', 'created_at', 'status']

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        """Mark an activity as completed."""
        activity = self.get_object()
        activity.status = Activity.ActivityStatus.COMPLETED
        activity.completed_date = timezone.now()
        activity.save(update_fields=['status', 'completed_date'])
        return Response({'status': 'completed'})


# ─────────────────────────────────────────────────────────────────────────────
# Notes
# ─────────────────────────────────────────────────────────────────────────────

class CrmNoteViewSet(viewsets.ModelViewSet):
    queryset = CrmNote.objects.select_related('opportunity', 'created_by').order_by('-created_at')
    serializer_class = CrmNoteSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['opportunity', 'contact', 'is_internal']

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        return private_file_response(self.get_object().attachment)


# ─────────────────────────────────────────────────────────────────────────────
# Capture Pipeline (Inbound Leads)
# ─────────────────────────────────────────────────────────────────────────────

class CRMInboundLeadView(APIView):
    """
    Public API for capturing leads from external sources (Websites, Webhooks).
    """
    permission_classes = [AllowAny]

    def post(self, request):
        data = request.data
        email = data.get('email', '').strip().lower()
        name = data.get('name', '')
        phone = data.get('phone', '')
        source = data.get('source', 'Web Form')
        interest = data.get('interest', 'General Inquiry')
        message = data.get('message', '')

        if not email or not name:
            return Response({'error': 'Name and Email are required'}, status=400)

        # 1. Deduplicate/Find Contact
        contact = Contact.objects.filter(email__iexact=email).first()
        if not contact:
            # Create light contact
            names = name.split(' ', 1)
            f_name = names[0]
            l_name = names[1] if len(names) > 1 else 'Lead'
            contact = Contact.objects.create(
                first_name=f_name,
                last_name=l_name,
                email=email,
                phone_mobile=phone,
                source=source,
                contact_type=Contact.ContactType.LEAD
            )

        # 2. Create Opportunity in Default Pipeline
        pipeline = Pipeline.objects.filter(is_default=True).first() or Pipeline.objects.first()
        if not pipeline:
            return Response({'error': 'No CRM pipeline configured'}, status=500)
        
        initial_stage = pipeline.stages.order_by('position').first()
        
        opp = Opportunity.objects.create(
            title=interest,
            contact=contact,
            pipeline=pipeline,
            stage=initial_stage,
            is_lead=True,
            email_from=email,
            phone=phone,
            contact_name=name
        )

        # 3. Add Message as Note
        if message:
            CrmNote.objects.create(
                opportunity=opp,
                body=f"Inbound message from {source}:\n\n{message}",
                is_internal=True
            )

        return Response({
            'status': 'Lead captured',
            'opportunity_id': str(opp.id),
            'reference': opp.reference
        }, status=status.HTTP_201_CREATED)


# ─────────────────────────────────────────────────────────────────────────────
# CRM Reports – Analytics & Forecasting
# ─────────────────────────────────────────────────────────────────────────────

class CrmReportView(APIView):

    def get(self, request):
        report_type = request.query_params.get('type', 'pipeline')

        if report_type == 'pipeline':
            return self._pipeline_summary(request)
        elif report_type == 'forecast':
            return self._revenue_forecast(request)
        elif report_type == 'win_loss':
            return self._win_loss_funnel(request)
        elif report_type == 'activities':
            return self._activity_summary(request)
        elif report_type == 'overview':
            return self._overview_kpis(request)
        elif report_type == 'sla':
            return self._sla_report(request)

        return Response({'error': 'Unknown report type'}, status=400)

    def _overview_kpis(self, request):
        """KPI row: total pipeline, weighted forecast, win rate, avg deal size."""
        opps = Opportunity.objects.filter(is_lead=False).exclude(stage__is_terminal=True)
        total_pipeline = opps.aggregate(t=Sum('expected_revenue'))['t'] or 0
        weighted_forecast = sum(
            float(o.expected_revenue or 0) * (o.probability / 100)
            for o in opps
        )

        won = Opportunity.objects.filter(stage__is_won=True)
        lost = Opportunity.objects.filter(stage__is_terminal=True, stage__is_won=False)
        total_closed = won.count() + lost.count()
        win_rate = round((won.count() / total_closed) * 100, 1) if total_closed > 0 else 0
        avg_deal = won.aggregate(avg=Avg('expected_revenue'))['avg'] or 0

        # Stale count
        stale_count = sum(1 for o in Opportunity.objects.filter(is_lead=False).exclude(stage__is_terminal=True) if o.is_stale)

        return Response({
            'total_pipeline': float(total_pipeline),
            'weighted_forecast': round(weighted_forecast, 2),
            'win_rate': win_rate,
            'avg_deal_size': float(avg_deal),
            'open_opportunities': opps.count(),
            'won_total': won.count(),
            'lost_total': lost.count(),
            'stale_deals': stale_count
        })

    def _pipeline_summary(self, request):
        """Stage-by-stage breakdown: count + revenue per stage."""
        pipeline_id = request.query_params.get('pipeline')
        stages_qs = PipelineStage.objects.order_by('position')
        if pipeline_id:
            stages_qs = stages_qs.filter(pipeline_id=pipeline_id)

        result = []
        for stage in stages_qs:
            opps = Opportunity.objects.filter(stage=stage, is_lead=False)
            agg = opps.aggregate(total=Sum('expected_revenue'), count=Count('id'))
            result.append({
                'stage_id': str(stage.id),
                'stage_name': stage.name,
                'stage_type': stage.stage_type,
                'color': stage.color,
                'probability': stage.probability,
                'is_terminal': stage.is_terminal,
                'is_won': stage.is_won,
                'count': agg['count'],
                'total_revenue': float(agg['total'] or 0),
                'weighted_revenue': float((agg['total'] or 0)) * (stage.probability / 100),
            })
        return Response(result)

    def _revenue_forecast(self, request):
        """
        Month × Agent revenue forecast table.
        Shows weighted expected revenue for the next 6 months.
        """
        today = timezone.now().date()
        months = []
        for i in range(6):
            month_offset = (today.month - 1 + i) % 12 + 1
            year_offset = today.year + ((today.month - 1 + i) // 12)
            months.append((year_offset, month_offset))

        from apps.hr.models import Employee  # type: ignore
        agents = Employee.objects.filter(opportunities__isnull=False).distinct()

        rows = []
        for agent in agents:
            row = {'agent_id': str(agent.id), 'agent_name': agent.full_name, 'months': {}}
            for year, month in months:
                opps = Opportunity.objects.filter(
                    assigned_agent=agent,
                    is_lead=False,
                    expected_closing__year=year,
                    expected_closing__month=month,
                ).exclude(stage__is_terminal=True)
                agg = opps.aggregate(t=Sum('expected_revenue'))
                weighted = sum(
                    float(o.expected_revenue or 0) * (o.probability / 100)
                    for o in opps
                )
                label = f"{calendar.month_abbr[month]} {year}"
                row['months'][label] = {
                    'total': float(agg['t'] or 0),
                    'weighted': round(weighted, 2),
                    'count': opps.count(),
                }
            rows.append(row)

        month_labels = [
            f"{calendar.month_abbr[m]} {y}" for y, m in months
        ]
        return Response({'agents': rows, 'months': month_labels})

    def _win_loss_funnel(self, request):
        """Win/Loss funnel: conversion rate between stages."""
        pipeline_id = request.query_params.get('pipeline')
        stages_qs = PipelineStage.objects.filter(is_terminal=False).order_by('position')
        if pipeline_id:
            stages_qs = stages_qs.filter(pipeline_id=pipeline_id)

        won_count = Opportunity.objects.filter(stage__is_won=True, is_lead=False).count()
        lost_count = Opportunity.objects.filter(
            stage__is_terminal=True, stage__is_won=False, is_lead=False
        ).count()

        funnel = []
        prev_count = None
        for stage in stages_qs:
            count = Opportunity.objects.filter(stage=stage, is_lead=False).count()
            conversion = round((count / prev_count) * 100, 1) if prev_count and prev_count > 0 else None
            funnel.append({
                'stage_name': stage.name,
                'color': stage.color,
                'count': count,
                'conversion_from_prev': conversion,
            })
            prev_count = count

        # Lost reasons breakdown
        from django.db.models import Count as DCount
        lost_reasons = (
            Opportunity.objects
            .filter(stage__is_terminal=True, stage__is_won=False)
            .values('lost_reason__name')
            .annotate(count=DCount('id'))
            .order_by('-count')
        )

        return Response({
            'funnel': funnel,
            'won': won_count,
            'lost': lost_count,
            'win_rate': round((won_count / (won_count + lost_count)) * 100, 1) if (won_count + lost_count) > 0 else 0,
            'lost_reasons': list(lost_reasons),
        })

    def _activity_summary(self, request):
        """Activity counts: overdue, due today, due this week, completed."""
        now = timezone.now()
        today_end = now.replace(hour=23, minute=59, second=59)
        week_end = now + timedelta(days=7)

        overdue = Activity.objects.filter(
            status='planned', due_date__lt=now
        ).count()
        due_today = Activity.objects.filter(
            status='planned', due_date__lte=today_end, due_date__gte=now
        ).count()
        due_week = Activity.objects.filter(
            status='planned', due_date__lte=week_end, due_date__gte=now
        ).count()
        completed = Activity.objects.filter(status='completed').count()

        # By type breakdown
        by_type = (
            Activity.objects
            .filter(status='planned')
            .values('activity_type')
            .annotate(count=Count('id'))
        )

        return Response({
            'overdue': overdue,
            'due_today': due_today,
            'due_this_week': due_week,
            'completed_total': completed,
            'by_type': list(by_type),
        })

    def _sla_report(self, request):
        """SLA Report: shows deals that exceed stage thresholds."""
        opps = Opportunity.objects.filter(is_lead=False).exclude(stage__is_terminal=True)
        stale_opps = [o for o in opps if o.is_stale]
        
        results = [{
            'id': str(o.id),
            'title': o.title,
            'reference': o.reference,
            'stage': o.stage.name,
            'agent': o.assigned_agent.full_name if o.assigned_agent else 'Unassigned',
            'days_in_stage': (timezone.now() - o.stage_entered_at).days,
            'limit': o.stage.sla_days
        } for o in stale_opps]
        
        return Response(results)
