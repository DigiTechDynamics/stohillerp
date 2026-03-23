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
    PasswordChangeSerializer
)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.prefetch_related('roles').order_by('first_name', 'last_name')
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter, DjangoFilterBackend]
    search_fields = ['first_name', 'last_name', 'email']
    filterset_fields = ['status', 'is_active']

    def get_serializer_class(self):
        if self.action == 'create':
            return UserCreateSerializer
        return UserSerializer

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


class RoleViewSet(viewsets.ModelViewSet):
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    permission_classes = [permissions.IsAuthenticated]


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.select_related('user').order_by('-timestamp')
    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['action', 'model_name', 'user']


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        serializer = UserSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class CurrencyViewSet(viewsets.ModelViewSet):
    queryset = Currency.objects.all().order_by('code')
    serializer_class = CurrencySerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [filters.SearchFilter]
    search_fields = ['code', 'name']


class ModuleViewSet(viewsets.ModelViewSet):
    queryset = Module.objects.all()
    serializer_class = ModuleSerializer
    permission_classes = [permissions.IsAuthenticated]


class SODRuleViewSet(viewsets.ModelViewSet):
    queryset = SODRule.objects.all()
    serializer_class = SODRuleSerializer
    permission_classes = [permissions.IsAuthenticated]
