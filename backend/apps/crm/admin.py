from django.contrib import admin
from .models import Contact, CrmTag, Pipeline, PipelineStage, Opportunity, CrmNote, Activity, LostReason, EmailTemplate

@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ('id', 'first_name', 'last_name', 'email', 'contact_type', 'status')
    list_filter = ('contact_type', 'status')
    search_fields = ('first_name', 'last_name', 'email')

@admin.register(CrmTag)
class CrmTagAdmin(admin.ModelAdmin):
    list_display = ('name', 'color')

@admin.register(Pipeline)
class PipelineAdmin(admin.ModelAdmin):
    list_display = ('name', 'pipeline_type', 'is_default')

@admin.register(PipelineStage)
class PipelineStageAdmin(admin.ModelAdmin):
    list_display = ('name', 'pipeline', 'stage_type', 'position', 'is_terminal')
    list_filter = ('pipeline', 'stage_type')

@admin.register(Opportunity)
class OpportunityAdmin(admin.ModelAdmin):
    list_display = ('reference', 'title', 'is_lead', 'stage', 'expected_revenue', 'assigned_agent')
    list_filter = ('is_lead', 'stage', 'priority')
    search_fields = ('reference', 'title', 'contact_name')

@admin.register(CrmNote)
class CrmNoteAdmin(admin.ModelAdmin):
    list_display = ('opportunity', 'body', 'is_internal', 'created_at')

@admin.register(Activity)
class ActivityAdmin(admin.ModelAdmin):
    list_display = ('subject', 'opportunity', 'activity_type', 'status', 'due_date')
    list_filter = ('activity_type', 'status')

@admin.register(LostReason)
class LostReasonAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active')
    list_filter = ('is_active',)

@admin.register(EmailTemplate)
class EmailTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'subject', 'created_at')
    search_fields = ('name', 'subject')
