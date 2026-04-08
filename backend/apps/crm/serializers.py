"""Stohil Properties - CRM Serializers (Odoo CRM parity)"""
from rest_framework import serializers
from utils.serializers import SanitizedModelSerializer
from apps.crm.models import (
    Contact, Opportunity, Pipeline, PipelineStage,
    Activity, CrmTag, CrmNote, LostReason, EmailTemplate,
    SalesTeam, ContactDocument
)


class SalesTeamSerializer(SanitizedModelSerializer):
    team_leader_name = serializers.ReadOnlyField(source='team_leader.full_name')
    member_count = serializers.IntegerField(source='members.count', read_only=True)

    class Meta:
        model = SalesTeam
        fields = ['id', 'name', 'description', 'team_leader', 'team_leader_name', 'members', 'member_count', 'is_active']


class ContactDocumentSerializer(SanitizedModelSerializer):
    verified_by_name = serializers.ReadOnlyField(source='verified_by.full_name')

    class Meta:
        model = ContactDocument
        fields = ['id', 'contact', 'name', 'document_type', 'file', 'expiry_date', 'is_verified', 'verified_by', 'verified_by_name', 'created_at']
        read_only_fields = ['created_at', 'verified_by']


class LostReasonSerializer(SanitizedModelSerializer):
    class Meta:
        model = LostReason
        fields = ['id', 'name', 'is_active']


class EmailTemplateSerializer(SanitizedModelSerializer):
    class Meta:
        model = EmailTemplate
        fields = ['id', 'name', 'subject', 'body', 'created_at']
        read_only_fields = ['created_at']
        non_sanitized_fields = ['body']


from django.core.validators import RegexValidator

# Zim National ID: 29-123456X78
ZIM_ID_REGEX = r'^\d{2}-\d{6,7}[A-Z]\d{2}$'
zim_id_validator = RegexValidator(
    regex=ZIM_ID_REGEX,
    message="ID Number must be in Zimbabwean format: 29-123456X78"
)

# Zim Mobile: +263 followed by 71/73/77/78 and 7 digits
ZIM_PHONE_REGEX = r'^\+263(71|73|77|78)\d{7}$'
zim_phone_validator = RegexValidator(
    regex=ZIM_PHONE_REGEX,
    message="Phone number must be in Zimbabwean format: +263771234567"
)

class ContactSerializer(SanitizedModelSerializer):
    full_name = serializers.ReadOnlyField()
    currency_code = serializers.ReadOnlyField(source='currency.code')
    active_leases = serializers.SerializerMethodField()
    assigned_agent_name = serializers.ReadOnlyField(source='assigned_agent.full_name')
    sales_team_name = serializers.ReadOnlyField(source='sales_team.name')
    opportunity_count = serializers.SerializerMethodField()
    document_count = serializers.SerializerMethodField()
    
    id_number = serializers.CharField(validators=[zim_id_validator], required=False)
    phone_mobile = serializers.CharField(validators=[zim_phone_validator], required=False)

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
        return obj.opportunities.count()

    def get_document_count(self, obj):
        return obj.documents.count()


class CrmTagSerializer(SanitizedModelSerializer):
    class Meta:
        model = CrmTag
        fields = ['id', 'name', 'color']


class PipelineStageSerializer(SanitizedModelSerializer):
    class Meta:
        model = PipelineStage
        fields = ['id', 'name', 'stage_type', 'position', 'color', 'probability', 'is_terminal', 'is_won', 'sla_days']


class PipelineSerializer(SanitizedModelSerializer):
    stages = PipelineStageSerializer(many=True, read_only=True)

    class Meta:
        model = Pipeline
        fields = ['id', 'name', 'pipeline_type', 'is_default', 'stages']


class CrmNoteSerializer(SanitizedModelSerializer):
    author_name = serializers.ReadOnlyField(source='created_by.full_name')

    class Meta:
        model = CrmNote
        fields = ['id', 'opportunity', 'contact', 'body', 'is_internal', 'attachment', 'created_at', 'author_name']
        read_only_fields = ['created_at', 'author_name']


class OpportunitySerializer(SanitizedModelSerializer):
    contact_display = serializers.SerializerMethodField()
    property_ref = serializers.CharField(source='property.reference_number', read_only=True)
    property_name = serializers.CharField(source='property.name', read_only=True)
    stage_name = serializers.CharField(source='stage.name', read_only=True)
    stage_color = serializers.CharField(source='stage.color', read_only=True)
    property_thumbnail = serializers.SerializerMethodField()
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

    def get_contact_display(self, obj):
        if obj.contact:
            return obj.contact.full_name
        return obj.contact_name or obj.email_from or "Unnamed Lead"

    def get_property_thumbnail(self, obj):
        if obj.property:
            primary_img = obj.property.images.filter(is_primary=True).first()
            if primary_img:
                return primary_img.image.url
            first_img = obj.property.images.first()
            return first_img.image.url if first_img else None
        return None

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


class ActivitySerializer(SanitizedModelSerializer):
    assigned_to_name = serializers.ReadOnlyField(source='assigned_to.full_name')
    email_template_name = serializers.ReadOnlyField(source='email_template.name')

    class Meta:
        model = Activity
        fields = '__all__'
