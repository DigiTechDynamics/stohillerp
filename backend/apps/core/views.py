"""Stohil Properties - Core App Views"""
from rest_framework import viewsets, permissions, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django_filters.rest_framework import DjangoFilterBackend
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.core.mail import send_mail
from django.conf import settings

from apps.core.models import User, Role, AuditLog, Currency, Module, SODRule
from apps.core.serializers import (
    UserSerializer, UserCreateSerializer, RoleSerializer, 
    AuditLogSerializer, CurrencySerializer, ModuleSerializer, SODRuleSerializer,
    PasswordChangeSerializer, UserProfileSerializer
)


class UserViewSet(viewsets.ModelViewSet):
    def get_queryset(self):
        """
        Enforce Data Isolation: 
        - Super Admins/Admin roles can see all users.
        - Others can only see their own user record.
        """
        user = self.request.user
        if user.is_superuser or user.has_role(Role.RoleType.SUPER_ADMIN) or user.has_role(Role.RoleType.ADMIN):
            return User.objects.prefetch_related('roles').order_by('first_name', 'last_name')
        return User.objects.filter(id=user.id).prefetch_related('roles')

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
        serializer = UserSerializer(request.user, context={'request': request})
        return Response(serializer.data)

    def patch(self, request):
        serializer = UserProfileSerializer(request.user, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(request.user, context={'request': request}).data)


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


class ForgotPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get('email')
        if not email:
            return Response({'error': 'Email is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            user = User.objects.get(email=email)
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            
            # Send email
            reset_link = f"http://localhost:5173/reset-password?uid={uid}&token={token}"
            send_mail(
                subject='Stohill Properties - Password Reset',
                message=f'Use the following link to reset your password:\n\n{reset_link}',
                from_email=getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@stohill.co.za'),
                recipient_list=[user.email],
                fail_silently=False,
            )
        except User.DoesNotExist:
            # Do not reveal that the user does not exist
            pass

        return Response({'message': 'If an account with that email exists, we have sent a password reset link.'})


class ResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        uidb64 = request.data.get('uid')
        token = request.data.get('token')
        new_password = request.data.get('new_password')

        if not all([uidb64, token, new_password]):
            return Response({'error': 'Missing credentials'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            user = None

        if user is not None and default_token_generator.check_token(user, token):
            user.set_password(new_password)
            user.save()
            return Response({'message': 'Password has been reset successfully.'})
        else:
            return Response({'error': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)
