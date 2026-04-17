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
from django.db.models import Q
from apps.crm.models import Contact, Opportunity
from apps.properties.models import Property, PropertyUnit
from apps.rentals.models import Lease
from apps.finance.models.ap import Supplier
from apps.finance.models.ar import CustomerProfile
from apps.finance.models.bank import BankAccount
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


class HealthCheckView(APIView):
    """
    Minimal connectivity check for UI indicators.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({
            'status': 'operational',
            'version': '1.0.0'
        })


class GlobalSearchView(APIView):
    """
    Universal search across CRM, Properties, and Finance modules.
    Normalize results for the Command Palette UI.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        q = request.query_params.get('q', '')
        if len(q) < 2:
            return Response([])

        results = []
        import re

        # --- Structured Intelligence Queries ---
        
        # 1. Unit Status (e.g., "Unit 102 status")
        unit_status_match = re.search(r'unit\s+(\S+)\s+status', q, re.I)
        if unit_status_match:
            unit_num = unit_status_match.group(1)
            unit = PropertyUnit.objects.filter(unit_number__icontains=unit_num).select_related('property').first()
            if unit:
                results.append({
                    'id': f'intel-unit-status-{unit.id}',
                    'category': 'Intelligence',
                    'title': f"Unit {unit.unit_number} is {unit.get_status_display().upper()}",
                    'subtitle': f"Location: {unit.property.name} | View Details",
                    'url': f'/properties/{unit.property.id}',
                    'icon': 'zap',
                    'is_intelligence': True
                })

        # 2. Rent Query (e.g., "Rent for Unit 102")
        rent_match = re.search(r'rent\s+(?:for|of)\s+(?:unit\s+)?(\S+)', q, re.I)
        if rent_match:
            target = rent_match.group(1)
            # Try Unit first
            unit = PropertyUnit.objects.filter(unit_number__icontains=target).first()
            if unit and unit.monthly_rental:
                results.append({
                    'id': f'intel-rent-{unit.id}',
                    'category': 'Intelligence',
                    'title': f"Monthly Rent: ${unit.monthly_rental:,.2f}",
                    'subtitle': f"Unit {unit.unit_number} Standard Rate",
                    'url': f'/properties/{unit.property_id}',
                    'icon': 'dollar-sign',
                    'is_intelligence': True
                })

        # 3. Lease Lookup (e.g., "Lease LSE-00001")
        lease_match = re.search(r'lease\s+(\S+)', q, re.I)
        if lease_match:
            lease_num = lease_match.group(1)
            lease = Lease.objects.filter(lease_number__icontains=lease_num).first()
            if lease:
                results.append({
                    'id': f'intel-lease-{lease.id}',
                    'category': 'Intelligence',
                    'title': f"Lease {lease.lease_number}: {lease.get_status_display()}",
                    'subtitle': f"Tenant: {lease.tenant.full_name} | Expires: {lease.end_date}",
                    'url': f'/rentals/leases',
                    'icon': 'file-text',
                    'is_intelligence': True
                })

        # --- Standard Keyword Search ---

        # 1. CRM Contacts
        contacts = Contact.objects.filter(
            Q(first_name__icontains=q) | 
            Q(last_name__icontains=q) | 
            Q(email__icontains=q) |
            Q(company__icontains=q)
        )[:5]
        for c in contacts:
            results.append({
                'id': str(c.id),
                'category': 'Contacts',
                'title': c.full_name,
                'subtitle': c.email or c.company or 'CRM Contact',
                'url': f'/crm/contacts/{c.id}',
                'icon': 'user'
            })

        # 2. CRM Opportunities
        opps = Opportunity.objects.filter(
            Q(title__icontains=q) | 
            Q(reference__icontains=q)
        )[:5]
        for o in opps:
            results.append({
                'id': str(o.id),
                'category': 'Opportunities',
                'title': o.title,
                'subtitle': f"{o.reference} | {o.get_priority_display()}",
                'url': f'/crm/opportunities/{o.id}',
                'icon': 'trending-up'
            })

        # 3. Properties
        props = Property.objects.filter(
            Q(name__icontains=q) | 
            Q(reference_number__icontains=q) |
            Q(city__icontains=q) |
            Q(suburb__icontains=q)
        )[:5]
        for p in props:
            results.append({
                'id': str(p.id),
                'category': 'Properties',
                'title': p.name,
                'subtitle': f"{p.reference_number} | {p.city}",
                'url': f'/properties/{p.id}',
                'icon': 'building'
            })

        # 4. Finance Suppliers
        suppliers = Supplier.objects.filter(
            Q(name__icontains=q) | 
            Q(tax_number__icontains=q) |
            Q(email__icontains=q)
        )[:5]
        for s in suppliers:
            results.append({
                'id': str(s.id),
                'category': 'Suppliers',
                'title': s.name,
                'subtitle': f"{s.tax_number or s.email or 'Finance'}",
                'url': f'/finance/ap/suppliers/{s.id}',
                'icon': 'truck'
            })

        # 5. Finance Customers
        customers = CustomerProfile.objects.filter(
            Q(name__icontains=q) | 
            Q(tax_number__icontains=q)
        )[:5]
        for c in customers:
            results.append({
                'id': str(c.id),
                'category': 'Customers',
                'title': c.contact_link.full_name if c.contact_link else c.name,
                'subtitle': f"AR Profile | {c.tax_number or ''}",
                'url': f'/finance/ar/customers/{c.id}',
                'icon': 'users'
            })

        # 6. Bank Accounts
        banks = BankAccount.objects.filter(
            Q(name__icontains=q) | 
            Q(bank_name__icontains=q) |
            Q(account_number__icontains=q)
        )[:5]
        for b in banks:
            results.append({
                'id': str(b.id),
                'category': 'Banking',
                'title': f"{b.bank_name} - {b.name}",
                'subtitle': f"{b.account_number} | {b.currency_id}",
                'url': f'/finance/banking/accounts/{b.id}',
                'icon': 'landmark'
            })

        return Response(results)
