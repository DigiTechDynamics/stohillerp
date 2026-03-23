package co.stohill.erp.rentals.models;

import co.stohill.erp.core.models.BaseEntity;
import co.stohill.erp.crm.models.Contact;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "rentals_maintenance")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MaintenanceRequest extends BaseEntity {

    public enum Priority {
        LOW, MEDIUM, HIGH, EMERGENCY
    }

    public enum MaintenanceStatus {
        LOGGED, ACKNOWLEDGED, IN_PROGRESS, PENDING_PARTS, COMPLETED, CLOSED, CANCELLED
    }

    @Column(unique = true, nullable = false)
    private String reference;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lease_id", nullable = false)
    private Lease lease;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reported_by_id")
    private Contact reportedBy;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private Priority priority = Priority.MEDIUM;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private MaintenanceStatus status = MaintenanceStatus.LOGGED;

    private String category;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String description;

    private BigDecimal estimatedCost;
    private BigDecimal actualCost;
    private String assignedContractor;
    private LocalDateTime scheduledDate;
    private LocalDateTime completedDate;

    @Column(columnDefinition = "TEXT")
    private String resolutionNotes;

    @Builder.Default
    private boolean billedToTenant = false;
}
