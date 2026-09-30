"""
Stohil Properties - Core App Serializers
User, Role, and Auth serializers.
"""
from rest_framework import serializers
from .models import User, Role, AuditLog, Currency, Module, SODRule


class ModuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Module
        fields = ['id', 'name', 'code', 'description', 'icon']


class SODRuleSerializer(serializers.ModelSerializer):
    module_a_name = serializers.ReadOnlyField(source='module_a.name')
    module_b_name = serializers.ReadOnlyField(source='module_b.name')

    class Meta:
        model = SODRule
        fields = ['id', 'name', 'module_a', 'module_b', 'module_a_name', 
                  'module_b_name', 'severity', 'description', 'is_active']


class RoleSerializer(serializers.ModelSerializer):
    modules = ModuleSerializer(many=True, read_only=True)
    module_ids = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=False
    )

    class Meta:
        model = Role
        fields = ['id', 'name', 'role_type', 'description', 'modules', 'module_ids']

    def update(self, instance, validated_data):
        module_ids = validated_data.pop('module_ids', None)
        instance = super().update(instance, validated_data)
        if module_ids is not None:
            instance.modules.set(Module.objects.filter(id__in=module_ids))
        return instance

    def create(self, validated_data):
        module_ids = validated_data.pop('module_ids', [])
        instance = Role.objects.create(**validated_data)
        if module_ids:
            instance.modules.set(Module.objects.filter(id__in=module_ids))
        return instance


class UserSerializer(serializers.ModelSerializer):
    roles = RoleSerializer(many=True, read_only=True)
    role_ids = serializers.ListField(
        child=serializers.UUIDField(), write_only=True, required=False
    )
    full_name = serializers.ReadOnlyField()
    accessible_modules = serializers.ReadOnlyField()
    sod_conflicts = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'first_name', 'last_name', 'full_name',
                  'phone', 'avatar', 'status', 'roles', 'role_ids', 'executive_mode',
                  'accessible_modules', 'sod_conflicts', 'is_superuser',
                  'date_joined', 'last_login']
        read_only_fields = ['id', 'date_joined', 'last_login', 'is_superuser']

    def update(self, instance, validated_data):
        role_ids = validated_data.pop('role_ids', None)
        instance = super().update(instance, validated_data)
        if role_ids is not None:
            instance.roles.set(Role.objects.filter(id__in=role_ids))
        return instance

    def get_sod_conflicts(self, obj):
        return obj.check_sod_conflicts()


class CurrentUserUpdateSerializer(UserSerializer):
    """
    Self-service profile edits via /core/me/. Roles and status are read-only
    here: accepting role_ids let any user grant themselves Super Admin.
    """

    class Meta(UserSerializer.Meta):
        read_only_fields = UserSerializer.Meta.read_only_fields + ['email', 'status', 'roles']

    def validate(self, attrs):
        attrs.pop('role_ids', None)
        return attrs


class UserCreateSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, required=False)
    role_ids = serializers.ListField(child=serializers.UUIDField(), write_only=True, required=False)

    class Meta:
        model = User
        fields = ['email', 'first_name', 'last_name', 'phone', 'password', 'role_ids']

    def create(self, validated_data):
        role_ids = validated_data.pop('role_ids', [])
        password = validated_data.pop('password', User.objects.make_random_password(length=12))
        user = User.objects.create_user(password=password, **validated_data)
        if role_ids:
            user.roles.set(Role.objects.filter(id__in=role_ids))
        return user


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)

    class Meta:
        model = AuditLog
        fields = ['id', 'user_name', 'action', 'model_name', 'object_id',
                  'object_repr', 'changes', 'ip_address', 'timestamp']


class CurrencySerializer(serializers.ModelSerializer):
    class Meta:
        model = Currency
        fields = '__all__'
class PasswordChangeSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, min_length=8, required=True)
    password_confirm = serializers.CharField(write_only=True, min_length=8, required=True)

    def validate(self, data):
        if data['password'] != data['password_confirm']:
            raise serializers.ValidationError("Passwords do not match")
        return data
