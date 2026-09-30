"""Stohil Properties - CRM Serializers (Odoo CRM parity)"""
from rest_framework import serializers

from utils.serializers import SensitiveFieldsMixin
from apps.crm.models import (
    Contact, Opportunity, Pipeline, PipelineStage,
    Activity, CrmTag, CrmNote, LostReason, EmailTemplate,
    SalesTeam, ContactDocument
)


class SalesTeamSerializer(serializers.ModelSerializer):
    team_leader_name = serializers.ReadOnlyField(source='team_leader.full_name')
    member_count = serializers.IntegerField(source='members.count', read_only=True)

    class Meta:
        model = SalesTeam
        fields = ['id', 'name', 'description', 'team_leader', 'team_leader_name', 'members', 'member_count', 'is_active']


class ContactDocumentSerializer(serializers.ModelSerializer):
    verified_by_name = serializers.ReadOnlyField(source='verified_by.full_name')
    # KYC files are private: download through the authenticated action only.
    download_url = serializers.SerializerMethodField()

    class Meta:
        model = ContactDocument
        fields = ['id', 'contact', 'name', 'document_type', 'file', 'download_url', 'expiry_date', 'is_verified',
                  'verified_by', 'verified_by_name', 'created_at']
        read_only_fields = ['created_at', 'verified_by']
        extra_kwargs = {'file': {'write_only': True}}

    def get_download_url(self, obj):
        return f'/api/v1/crm/contact-documents/{obj.pk}/download/' if obj.file else None


class LostReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = LostReason
        fields = ['id', 'name', 'is_active']


class EmailTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = EmailTemplate
        fields = ['id', 'name', 'subject', 'body', 'created_at']
        read_only_fields = ['created_at']


class ContactSerializer(SensitiveFieldsMixin, serializers.ModelSerializer):
    # Identity and affordability data only for modules that deal with the
    # client directly; finance and documents see the contact as a lookup.
    sensitive_fields = ('id_number', 'passport_number', 'annual_income', 'affordability', 'credit_rating')
    sensitive_modules = {'crm', 'rentals', 'sales'}
    full_name = serializers.ReadOnlyField()
    currency_code = serializers.ReadOnlyField(source='currency.code')
    active_leases = serializers.SerializerMethodField()
    assigned_agent_name = serializers.ReadOnlyField(source='assigned_agent.full_name')
    sales_team_name = serializers.ReadOnlyField(source='sales_team.name')
    opportunity_count = serializers.SerializerMethodField()
    document_count = serializers.SerializerMethodField()

    class Meta:
        model = Contact
        fields = '__all__'

    def get_active_leases(self, obj):
        try:
            from apps.rentals.models import Lease
            leases = Lease.objects.filter(tenant=obj, status='active').select_related('property')
            return [{
                'id': str(l.id),
                'lease_number': l.lease_number,
                'property_id': str(l.property.id),
                'property_name': l.property.name,
                'property_ref': l.property.reference_number
            } for l in leases]
        except Exception:
            return []

    def get_opportunity_count(self, obj):
        # related_name is "contact_opportunities"; the old "opportunities"
        # attribute raised AttributeError, crashing the whole contacts list.
        return obj.contact_opportunities.count()

    def get_document_count(self, obj):
        return obj.documents.count()


class CrmTagSerializer(serializers.ModelSerializer):
    class Meta:
        model = CrmTag
        fields = ['id', 'name', 'color']


class PipelineStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = PipelineStage
        fields = ['id', 'name', 'stage_type', 'position', 'color', 'probability', 'is_terminal', 'is_won', 'sla_days']


class PipelineSerializer(serializers.ModelSerializer):
    stages = PipelineStageSerializer(many=True, read_only=True)

    class Meta:
        model = Pipeline
        fields = ['id', 'name', 'pipeline_type', 'is_default', 'stages']


class CrmNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.ReadOnlyField(source='created_by.full_name')

    class Meta:
        model = CrmNote
        fields = ['id', 'opportunity', 'contact', 'body', 'is_internal', 'attachment', 'attachment_url',
                  'created_at', 'author_name']
        read_only_fields = ['created_at', 'author_name']
        extra_kwargs = {'attachment': {'write_only': True}}

    attachment_url = serializers.SerializerMethodField()

    def get_attachment_url(self, obj):
        return f'/api/v1/crm/notes/{obj.pk}/download/' if obj.attachment else None


class OpportunitySerializer(serializers.ModelSerializer):
    contact_display = serializers.SerializerMethodField()
    property_ref = serializers.CharField(source='property.reference_number', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    stage_name = serializers.CharField(source='stage.name', read_only=True)
    stage_color = serializers.CharField(source='stage.color', read_only=True)
    currency_code = serializers.ReadOnlyField(source='currency.code')
    tags_display = CrmTagSerializer(source='tags', many=True, read_only=True)
    next_activity_date = serializers.SerializerMethodField()
    assigned_agent_name = serializers.ReadOnlyField(source='assigned_agent.full_name')
    sales_team_name = serializers.ReadOnlyField(source='sales_team.name')
    lost_reason_name = serializers.ReadOnlyField(source='lost_reason.name')
    pipeline_stages = serializers.SerializerMethodField()
    contact_email = serializers.SerializerMethodField()
    contact_phone = serializers.SerializerMethodField()
    contact_obj = serializers.SerializerMethodField()
    is_stale = serializers.ReadOnlyField()

    class Meta:
        model = Opportunity
        fields = '__all__'
        # Opportunity.save() generates the reference; clients shouldn't have to.
        extra_kwargs = {'reference': {'required': False}}

    def get_contact_display(self, obj):
        if obj.contact:
            return obj.contact.full_name
        return obj.contact_name or obj.email_from or "Unnamed Lead"

    def get_next_activity_date(self, obj):
        activity = obj.opportunity_activities.filter(status='planned').order_by('due_date').first()
        return activity.due_date if activity else None

    def get_pipeline_stages(self, obj):
        """Return ordered non-terminal stages for the stage progress bar."""
        stages = PipelineStage.objects.filter(
            pipeline=obj.pipeline
        ).order_by('position')
        return PipelineStageSerializer(stages, many=True).data

    def get_contact_email(self, obj):
        if obj.contact:
            return obj.contact.email
        return obj.email_from

    def get_contact_phone(self, obj):
        if obj.contact:
            return obj.contact.phone_mobile
        return obj.phone

    def get_contact_obj(self, obj):
        if obj.contact:
            return {
                'id': str(obj.contact.id),
                'first_name': obj.contact.first_name,
                'last_name': obj.contact.last_name,
                'email': obj.contact.email,
                'phone_mobile': obj.contact.phone_mobile,
                'company': obj.contact.company,
                'rating': obj.contact.rating,
                'lead_score': obj.contact.lead_score,
            }
        return None

    def get_internal_notes(self, obj):
        note = obj.opportunity_notes.filter(is_internal=True).order_by('-created_at').first()
        return note.body if note else ''


class ActivitySerializer(serializers.ModelSerializer):
    assigned_to_name = serializers.ReadOnlyField(source='assigned_to.full_name')
    email_template_name = serializers.ReadOnlyField(source='email_template.name')

    class Meta:
        model = Activity
        fields = '__all__'
