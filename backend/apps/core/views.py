"""Stohil Properties - Core App Views"""
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend

from apps.core.models import User, Role, AuditLog, Currency, Module, SODRule
from apps.core.serializers import (
    UserSerializer, UserCreateSerializer, RoleSerializer,
    AuditLogSerializer, CurrencySerializer, ModuleSerializer, SODRuleSerializer,
    PasswordChangeSerializer, CurrentUserUpdateSerializer
)
from utils.permissions import HasModuleAccess, user_modules
from utils.record_rules import RecordRulesMixin


def is_access_admin(user):
    """Superusers and holders of the 'admin' (User Access Management) module."""
    return user.is_superuser or 'admin' in user_modules(user)


class AccessAdminWritePermission(permissions.BasePermission):
    """Reads for any authenticated user; changes to users/roles/modules/SoD need access admin."""
    message = 'Only access administrators can change users, roles or SoD rules.'

    def has_permission(self, request, view):
        return request.method in permissions.SAFE_METHODS or is_access_admin(request.user)


class UserViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = User.objects.prefetch_related('roles__modules').order_by('first_name', 'last_name')
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, AccessAdminWritePermission]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['first_name', 'last_name', 'email']
    filterset_fields = ['status', 'is_active']

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

    def get_permissions(self):
        # Users may change their own password; everything else that writes
        # (including resetting someone else's password) needs access admin.
        if self.action == 'set_password' and str(self.kwargs.get('pk')) == str(self.request.user.pk):
            return [permissions.IsAuthenticated()]
        return super().get_permissions()

    @action(detail=True, methods=['post'])
    def toggle_executive_mode(self, request, pk=None):
        user = self.get_object()
        user.executive_mode = not user.executive_mode
        user.save(update_fields=['executive_mode'])
        return Response({'executive_mode': user.executive_mode})

    @action(detail=True, methods=['post'])
    def sod_conflicts(self, request, pk=None):
        user = self.get_object()
        return Response({'conflicts': user.check_sod_conflicts()})

    @action(detail=True, methods=['post'], url_path='set-password')
    def set_password(self, request, pk=None):
        user = self.get_object()
        serializer = PasswordChangeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        user.set_password(serializer.validated_data['password'])
        if user.status == User.UserStatus.PENDING:
            user.status = User.UserStatus.ACTIVE
        user.save()
        
        return Response({'status': 'password set successfully'})


class RoleViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = Role.objects.prefetch_related('modules')
    serializer_class = RoleSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, AccessAdminWritePermission]


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET core/audit-logs/  ?action=&model_name=&user=&search=&from_date=&to_date=
    GET core/audit-logs/models/   the record types that appear in the log (for the filter)
    """
    queryset = AuditLog.objects.select_related('user').order_by('-timestamp')
    serializer_class = AuditLogSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['action', 'model_name', 'user']
    search_fields = ['object_repr', 'object_id', 'model_name', 'user__email', 'user__first_name', 'user__last_name']

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        if params.get('from_date'):
            qs = qs.filter(timestamp__date__gte=params['from_date'])
        if params.get('to_date'):
            qs = qs.filter(timestamp__date__lte=params['to_date'])
        return qs

    @action(detail=False, methods=['get'])
    def models(self, request):
        return Response(sorted(AuditLog.objects.values_list('model_name', flat=True).distinct()))


class CurrentUserView(APIView):

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        serializer = CurrentUserUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class CurrencyViewSet(RecordRulesMixin, viewsets.ModelViewSet):
    queryset = Currency.objects.all().order_by('code')
    serializer_class = CurrencySerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['code', 'name']


class ModuleViewSet(viewsets.ModelViewSet):
    queryset = Module.objects.all()
    serializer_class = ModuleSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, AccessAdminWritePermission]


class SODRuleViewSet(viewsets.ModelViewSet):
    queryset = SODRule.objects.all()
    serializer_class = SODRuleSerializer
    permission_classes = [permissions.IsAuthenticated, HasModuleAccess, AccessAdminWritePermission]

    @action(detail=False, methods=['get'])
    def suggestions(self, request):
        """Standard conflicting module pairs that no rule covers yet."""
        from apps.core.sod_suggestions import suggestions
        return Response(suggestions())
