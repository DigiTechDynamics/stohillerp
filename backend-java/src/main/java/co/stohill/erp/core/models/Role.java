package co.stohill.erp.core.models;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "core_roles")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Role extends BaseEntity {

    public enum RoleType {
        SUPER_ADMIN, ADMIN, FINANCE_MANAGER, SALES_MANAGER, RENTAL_MANAGER,
        AGENT, ACCOUNTANT, HR_MANAGER, COMPLIANCE_OFFICER, EXECUTIVE, VIEWER
    }

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(name = "role_type", unique = true, nullable = false)
    private RoleType roleType;

    @Column(columnDefinition = "TEXT")
    private String description;

    // Granular Permissions
    @Builder.Default
    private boolean canViewFinance = false;
    @Builder.Default
    private boolean canEditFinance = false;
    @Builder.Default
    private boolean canPostJournal = false;
    @Builder.Default
    private boolean canViewProperties = true;
    @Builder.Default
    private boolean canEditProperties = false;
    @Builder.Default
    private boolean canViewCrm = true;
    @Builder.Default
    private boolean canEditCrm = false;
    @Builder.Default
    private boolean canViewHr = false;
    @Builder.Default
    private boolean canEditHr = false;
    @Builder.Default
    private boolean canViewCommissions = false;
    @Builder.Default
    private boolean canApproveCommissions = false;
    @Builder.Default
    private boolean canViewDocuments = true;
    @Builder.Default
    private boolean canManageDocuments = false;
    @Builder.Default
    private boolean canViewDashboard = true;
    @Builder.Default
    private boolean canViewExecutiveDashboard = false;

    public RoleType getRoleType() {
        return roleType;
    }

    public void setCanEditProperties(boolean val) {
        this.canEditProperties = val;
    }

    public void setCanEditFinance(boolean val) {
        this.canEditFinance = val;
    }

    public void setCanPostJournal(boolean val) {
        this.canPostJournal = val;
    }

    public void setCanApproveCommissions(boolean val) {
        this.canApproveCommissions = val;
    }

    public void setCanManageDocuments(boolean val) {
        this.canManageDocuments = val;
    }

    public void setCanViewExecutiveDashboard(boolean val) {
        this.canViewExecutiveDashboard = val;
    }

    public static RoleBuilder builder() {
        return new RoleBuilder();
    }

    public static class RoleBuilder {
        private String name;
        private RoleType roleType;
        private String description;
        private boolean canViewFinance = false, canEditFinance = false, canPostJournal = false;
        private boolean canViewProperties = true, canEditProperties = false;
        private boolean canViewCrm = true, canEditCrm = false;
        private boolean canViewHr = false, canEditHr = false;
        private boolean canViewCommissions = false, canApproveCommissions = false;
        private boolean canViewDocuments = true, canManageDocuments = false;
        private boolean canViewDashboard = true, canViewExecutiveDashboard = false;

        public RoleBuilder name(String name) {
            this.name = name;
            return this;
        }

        public RoleBuilder roleType(RoleType roleType) {
            this.roleType = roleType;
            return this;
        }

        public RoleBuilder description(String description) {
            this.description = description;
            return this;
        }

        public RoleBuilder canViewFinance(boolean b) {
            this.canViewFinance = b;
            return this;
        }

        public RoleBuilder canEditFinance(boolean b) {
            this.canEditFinance = b;
            return this;
        }

        public RoleBuilder canPostJournal(boolean b) {
            this.canPostJournal = b;
            return this;
        }

        public RoleBuilder canViewProperties(boolean b) {
            this.canViewProperties = b;
            return this;
        }

        public RoleBuilder canEditProperties(boolean b) {
            this.canEditProperties = b;
            return this;
        }

        public RoleBuilder canViewCrm(boolean b) {
            this.canViewCrm = b;
            return this;
        }

        public RoleBuilder canEditCrm(boolean b) {
            this.canEditCrm = b;
            return this;
        }

        public RoleBuilder canViewHr(boolean b) {
            this.canViewHr = b;
            return this;
        }

        public RoleBuilder canEditHr(boolean b) {
            this.canEditHr = b;
            return this;
        }

        public RoleBuilder canViewCommissions(boolean b) {
            this.canViewCommissions = b;
            return this;
        }

        public RoleBuilder canApproveCommissions(boolean b) {
            this.canApproveCommissions = b;
            return this;
        }

        public RoleBuilder canViewDocuments(boolean b) {
            this.canViewDocuments = b;
            return this;
        }

        public RoleBuilder canManageDocuments(boolean b) {
            this.canManageDocuments = b;
            return this;
        }

        public RoleBuilder canViewDashboard(boolean b) {
            this.canViewDashboard = b;
            return this;
        }

        public RoleBuilder canViewExecutiveDashboard(boolean b) {
            this.canViewExecutiveDashboard = b;
            return this;
        }

        public Role build() {
            Role r = new Role();
            r.name = this.name;
            r.roleType = this.roleType;
            r.description = this.description;
            r.canViewFinance = this.canViewFinance;
            r.canEditFinance = this.canEditFinance;
            r.canPostJournal = this.canPostJournal;
            r.canViewProperties = this.canViewProperties;
            r.canEditProperties = this.canEditProperties;
            r.canViewCrm = this.canViewCrm;
            r.canEditCrm = this.canEditCrm;
            r.canViewHr = this.canViewHr;
            r.canEditHr = this.canEditHr;
            r.canViewCommissions = this.canViewCommissions;
            r.canApproveCommissions = this.canApproveCommissions;
            r.canViewDocuments = this.canViewDocuments;
            r.canManageDocuments = this.canManageDocuments;
            r.canViewDashboard = this.canViewDashboard;
            r.canViewExecutiveDashboard = this.canViewExecutiveDashboard;
            return r;
        }
    }
}
