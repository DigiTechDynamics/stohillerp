"""
Stohil Properties - Core Models
Base models including custom User, Role-Based Access Control,
and audit mixins used across all modules.
All primary keys use UUID for security and distributed-system readiness.
"""

import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.utils import timezone


# ─── Abstract Base Mixins ──────────────────────────────────────────────────────

class UUIDModel(models.Model):
    """Base model with UUID primary key. Used by all Stohill models."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(UUIDModel):
    """Adds created_at and updated_at timestamps to any model."""
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta(UUIDModel.Meta):
        abstract = True


class AuditedModel(TimeStampedModel):
    """
    Full audit trail mixin. Tracks who created/modified records.
    Used for compliance-critical models (Finance, Documents, Sales).
    """
    created_by = models.ForeignKey(
        'core.User',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='%(class)s_created',
    )
    updated_by = models.ForeignKey(
        'core.User',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='%(class)s_updated',
    )

    class Meta(TimeStampedModel.Meta):
        abstract = True


# ─── Module and SOD Matrix ────────────────────────────────────────────────────

class Module(TimeStampedModel):
    """
    Core system modules that can be assigned to roles.
    Matches sidebar navigation groups.
    """
    name = models.CharField(max_length=100)
    code = models.CharField(max_length=50, unique=True)  # e.g., 'finance', 'crm'
    description = models.TextField(blank=True)
    icon = models.CharField(max_length=50, blank=True)  # lucide icon name

    class Meta(TimeStampedModel.Meta):
        abstract = False  # Explicitly mark as non-abstract for children of TimeStampedModel
        db_table = 'core_modules'
        ordering = ['name']

    def __str__(self):
        return self.name


class SODRule(TimeStampedModel):
    """
    Segregation of Duties (SOD) logic.
    Defines module combinations that are considered a conflict.
    """
    class Severity(models.TextChoices):
        CRITICAL = 'critical', 'Critical (Hard Block)'
        WARNING = 'warning', 'Warning (Soft Block)'
        ADVISORY = 'advisory', 'Advisory'

    name = models.CharField(max_length=200)
    module_a = models.ForeignKey(Module, on_delete=models.CASCADE, related_name='sod_conflicts_a')
    module_b = models.ForeignKey(Module, on_delete=models.CASCADE, related_name='sod_conflicts_b')
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.CRITICAL)
    description = models.TextField()
    is_active = models.BooleanField(default=True)

    class Meta(TimeStampedModel.Meta):
        abstract = False
        db_table = 'core_sod_rules'
        constraints = [
            models.UniqueConstraint(fields=['module_a', 'module_b'], name='unique_sod_pair')
        ]

    def __str__(self):
        return f"SOD: {self.module_a.name} vs {self.module_b.name} ({self.severity})"


# ─── RBAC: Roles and Permissions ──────────────────────────────────────────────

class Role(TimeStampedModel):
    """
    Application-level roles for RBAC.
    Each user is assigned one or more roles that determine their access.
    """

    class RoleType(models.TextChoices):
        SUPER_ADMIN = 'super_admin', 'Super Administrator'
        ADMIN = 'admin', 'Administrator'
        FINANCE_MANAGER = 'finance_manager', 'Finance Manager'
        SALES_MANAGER = 'sales_manager', 'Sales Manager'
        RENTAL_MANAGER = 'rental_manager', 'Rental Manager'
        AGENT = 'agent', 'Property Agent'
        ACCOUNTANT = 'accountant', 'Accountant'
        HR_MANAGER = 'hr_manager', 'HR Manager'
        COMPLIANCE_OFFICER = 'compliance_officer', 'Compliance Officer'
        EXECUTIVE = 'executive', 'Executive / Director'
        VIEWER = 'viewer', 'Read-Only Viewer'
        TENANT = 'tenant', 'Tenant (self-service portal)'

    name = models.CharField(max_length=100)
    role_type = models.CharField(max_length=50, choices=RoleType.choices, unique=True)
    description = models.TextField(blank=True)

    # Dynamic Module-level access
    modules = models.ManyToManyField(Module, blank=True, related_name='roles')

    class Meta(TimeStampedModel.Meta):
        abstract = False
        db_table = 'core_roles'
        ordering = ['name']

    def __str__(self):
        return self.name


# ─── Custom User Manager ───────────────────────────────────────────────────────

class UserManager(BaseUserManager):
    """Custom manager for Stohill User model."""

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email address is required')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)
        return self.create_user(email, password, **extra_fields)


# ─── User Model ───────────────────────────────────────────────────────────────

class User(AbstractBaseUser, PermissionsMixin, UUIDModel):
    """
    Custom User model for Stohil Properties.
    Uses email as primary identifier (not username).
    Linked to roles for RBAC and to HR employee record.
    """

    class UserStatus(models.TextChoices):
        ACTIVE = 'active', 'Active'
        INACTIVE = 'inactive', 'Inactive'
        SUSPENDED = 'suspended', 'Suspended'
        PENDING = 'pending', 'Pending Activation'

    # Identity
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20, blank=True)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)

    # Status
    status = models.CharField(max_length=20, choices=UserStatus.choices, default=UserStatus.PENDING)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    # RBAC
    roles = models.ManyToManyField(Role, blank=True, related_name='users')

    # Tenant portal: the CRM contact this login belongs to.
    contact = models.OneToOneField('crm.Contact', null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name='portal_user')

    # Metadata
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    date_joined = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # Executive mode: enables enhanced dashboard view
    executive_mode = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    class Meta(UUIDModel.Meta):
        abstract = False
        db_table = 'core_users'
        ordering = ['first_name', 'last_name']

    def __str__(self):
        return f'{self.full_name} <{self.email}>'

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()

    def has_permission(self, permission_name):
        """Check if user has a specific permission across any of their roles."""
        return self.roles.filter(**{permission_name: True}).exists()

    def has_role(self, role_type):
        """Check if user has a specific role type."""
        return self.roles.filter(role_type=role_type).exists()

    @property
    def accessible_modules(self):
        """Returns unique list of module codes this user can access, enforced by SOD rules."""
        # 1. Superusers always get everything
        if self.is_superuser or self.has_role(Role.RoleType.SUPER_ADMIN):
            return list(Module.objects.values_list('code', flat=True))

        # Tenants see only their self-service portal (not even the dashboard).
        if self.is_portal_only:
            return ['portal']
        
        # 2. Get all modules assigned to user's roles
        # Note: We removed the global 'admin' bypass here. 
        # Admins now only see what is assigned to their specific roles.
        assigned_modules = set(Module.objects.filter(roles__users=self).distinct().values_list('code', flat=True))
        
        # 3. Always include dashboard for everyone
        assigned_modules.add('dashboard')
        
        # 4. Enforce Critical SOD violations (blocking access)
        return self._enforce_critical_sod(assigned_modules)

    @property
    def is_portal_only(self):
        """A tenant login with no staff role."""
        if self.is_superuser:
            return False
        role_types = set(self.roles.values_list('role_type', flat=True))
        return role_types == {Role.RoleType.TENANT}

    def _enforce_critical_sod(self, module_codes):
        """
        Filters out conflicting modules based on 'Critical' SOD rules.
        If a violation is found, the second module (module_b) in the rule is blocked.
        """
        blocked_modules = set()
        active_rules = SODRule.objects.filter(is_active=True, severity=SODRule.Severity.CRITICAL).select_related('module_a', 'module_b')
        
        for rule in active_rules:
            if rule.module_a.code in module_codes and rule.module_b.code in module_codes:
                # Block the second module in the conflict pair
                blocked_modules.add(rule.module_b.code)
        
        return [code for code in module_codes if code not in blocked_modules]

    def check_sod_conflicts(self):
        """
        Validates the user's assigned modules against active SOD rules.
        Returns a list of conflict dicts.
        """
        # We check ASSIGNED modules to report conflicts, even if accessible_modules filters them for enforcement
        user_modules = set(Module.objects.filter(roles__users=self).distinct().values_list('code', flat=True))
        conflicts = []
        
        rules = SODRule.objects.filter(is_active=True).select_related('module_a', 'module_b')
        for rule in rules:
            if rule.module_a.code in user_modules and rule.module_b.code in user_modules:
                conflicts.append({
                    'rule': rule.name,
                    'modules': [rule.module_a.name, rule.module_b.name],
                    'severity': rule.severity,
                    'description': rule.description
                })
        return conflicts


# ─── Audit Log ────────────────────────────────────────────────────────────────

class AuditLog(UUIDModel):
    """
    Immutable audit trail for all significant system actions.
    Compliance requirement for financial and property transactions.
    """

    class ActionType(models.TextChoices):
        CREATE = 'create', 'Create'
        UPDATE = 'update', 'Update'
        DELETE = 'delete', 'Delete'
        VIEW = 'view', 'View'
        EXPORT = 'export', 'Export'
        LOGIN = 'login', 'Login'
        LOGOUT = 'logout', 'Logout'
        POST = 'post', 'Post (Finance)'
        APPROVE = 'approve', 'Approve'
        REJECT = 'reject', 'Reject'

    user = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='audit_logs')
    action = models.CharField(max_length=20, choices=ActionType.choices)
    model_name = models.CharField(max_length=100)
    object_id = models.CharField(max_length=100)
    object_repr = models.CharField(max_length=500, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.TextField(blank=True)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta(UUIDModel.Meta):
        abstract = False
        db_table = 'core_audit_logs'
        ordering = ['-timestamp']

    def __str__(self):
        return f'{self.user} {self.action} {self.model_name} at {self.timestamp}'


# ─── System Configuration ─────────────────────────────────────────────────────

class SystemConfig(UUIDModel):
    """
    Key-value store for system-wide configuration.
    Settings like VAT rates, currency, company info, etc.
    """
    key = models.CharField(max_length=100, unique=True)
    value = models.JSONField()
    description = models.TextField(blank=True)
    is_sensitive = models.BooleanField(default=False)  # Mask in API responses
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL)

    class Meta(UUIDModel.Meta):
        abstract = False
        db_table = 'core_system_config'

    def __str__(self):
        return self.key


class Currency(AuditedModel):
    """
    Currencies supported by the system.
    Reporting currency (base) is usually USD or ZAR.
    """
    code = models.CharField(max_length=3, unique=True)  # e.g., 'USD', 'ZAR'
    name = models.CharField(max_length=50)
    symbol = models.CharField(max_length=5, blank=True)
    is_base = models.BooleanField(default=False, help_text="System-wide reporting currency")
    is_active = models.BooleanField(default=True)

    class Meta(AuditedModel.Meta):
        abstract = False
        db_table = 'core_currencies'
        verbose_name_plural = 'Currencies'

    def __str__(self):
        return f"{self.code} - {self.name}"


class NumberSequence(TimeStampedModel):
    """
    Centralized number sequence generator for all modules.
    Examples: INV-0001, JNL-2024-001, etc.
    """
    name = models.CharField(max_length=100, unique=True, help_text="e.g. 'Customer Invoice'")
    prefix = models.CharField(max_length=20, blank=True)
    suffix = models.CharField(max_length=20, blank=True)
    next_number = models.PositiveIntegerField(default=1)
    padding = models.PositiveIntegerField(default=4, help_text="Number of digits, e.g. 4 for 0001")
    is_active = models.BooleanField(default=True)

    class Meta(TimeStampedModel.Meta):
        abstract = False
        db_table = 'core_number_sequences'
        verbose_name = 'Number Sequence'
        verbose_name_plural = 'Number Sequences'

    def __str__(self):
        return self.name

    def get_next(self, increment=True):
        """Generates the next formatted number in the sequence."""
        formatted_number = f"{self.prefix}{str(self.next_number).zfill(self.padding)}{self.suffix}"
        if increment:
            self.next_number += 1
            self.save(update_fields=['next_number'])
        return formatted_number
