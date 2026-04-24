from rest_framework import permissions # type: ignore
from apps.core.models import Role

class IsFinanceAdminOrAccountant(permissions.BasePermission):
    """
    Allows access only to Super Users, Admins and Accountants.
    Useful for VAT and financial setting management in Zimbabwe context.
    """
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        # Superusers can do anything
        if request.user.is_superuser:
            return True
        
        # Check roles
        allowed_roles = [
            Role.RoleType.SUPER_ADMIN,
            Role.RoleType.ADMIN,
            Role.RoleType.ACCOUNTANT,
            Role.RoleType.FINANCE_MANAGER
        ]
        
        return request.user.roles.filter(role_type__in=allowed_roles).exists()


class IsHRAdminOrManager(permissions.BasePermission):
    """
    Allows access only to Super Users, Admins and HR Managers.
    Used for employee record management and sensitive HR data.
    """
    
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        
        if request.user.is_superuser:
            return True
            
        allowed_roles = [
            Role.RoleType.SUPER_ADMIN,
            Role.RoleType.ADMIN,
            Role.RoleType.HR_MANAGER
        ]
        
        return request.user.roles.filter(role_type__in=allowed_roles).exists()
