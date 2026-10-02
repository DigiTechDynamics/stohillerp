from django.urls import path

from apps.propman import owner_portal as v

urlpatterns = [
    path('me/', v.OwnerMeView.as_view()),
    path('statement/', v.OwnerStatementView.as_view()),
    path('properties/', v.OwnerPropertiesView.as_view()),
    path('maintenance/', v.OwnerMaintenanceView.as_view()),
    path('quotes/', v.OwnerQuotesView.as_view()),
    path('quotes/<uuid:pk>/decide/', v.OwnerQuoteDecisionView.as_view()),
]
