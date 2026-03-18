package co.stohill.erp.crm.models;

import co.stohill.erp.core.models.BaseEntity;
import co.stohill.erp.hr.models.Employee;
import co.stohill.erp.properties.models.Property;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "crm_activities")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Activity extends BaseEntity {

    public enum ActivityType {
        CALL, EMAIL, MEETING, VIEWING, TASK, NOTE, WHATSAPP
    }

    public enum ActivityStatus {
        PLANNED, COMPLETED, CANCELLED, OVERDUE
    }

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contact_id")
    private Contact contact;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "opportunity_id")
    private Opportunity opportunity;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "property_id")
    private Property property;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ActivityType activityType;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private ActivityStatus status = ActivityStatus.PLANNED;

    @Column(nullable = false)
    private String subject;

    @Column(columnDefinition = "TEXT")
    private String description;

    private LocalDateTime dueDate;
    private LocalDateTime completedDate;
    private Integer durationMinutes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_to_id")
    private Employee assignedTo;
}
