from django.urls import path

from apps.propman import contractor_portal as v

urlpatterns = [
    path('me/', v.ContractorMeView.as_view()),
    path('jobs/', v.ContractorJobsView.as_view()),
    path('jobs/<str:reference>/', v.ContractorJobView.as_view(http_method_names=['patch', 'options'])),
    path('jobs/<str:reference>/done/', v.ContractorJobDoneView.as_view()),
    path('quotes/', v.ContractorQuotesView.as_view()),
]
