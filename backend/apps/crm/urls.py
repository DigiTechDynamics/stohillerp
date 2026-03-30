from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register('contacts', views.ContactViewSet, basename='contacts')
router.register('opportunities', views.OpportunityViewSet, basename='opportunities')
router.register('pipelines', views.PipelineViewSet, basename='pipelines')
router.register('activities', views.ActivityViewSet, basename='activities')
router.register('tags', views.CrmTagViewSet, basename='tags')
router.register('notes', views.CrmNoteViewSet, basename='notes')
router.register('lost-reasons', views.LostReasonViewSet, basename='lost-reasons')
router.register('email-templates', views.EmailTemplateViewSet, basename='email-templates')
router.register('pipeline-stages', views.PipelineStageViewSet, basename='pipeline-stages')
router.register('sales-teams', views.SalesTeamViewSet, basename='sales-teams')
router.register('contact-documents', views.ContactDocumentViewSet, basename='contact-documents')

urlpatterns = [
    path('', include(router.urls)),
    path('reports/', views.CrmReportView.as_view(), name='crm-reports'),
    path('inbound-lead/', views.CRMInboundLeadView.as_view(), name='crm-inbound-lead'),
]
