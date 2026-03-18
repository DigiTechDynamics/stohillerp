package co.stohill.erp.crm.models;

import co.stohill.erp.core.models.BaseEntity;
import co.stohill.erp.hr.models.Employee;
import co.stohill.erp.properties.models.Property;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "crm_opportunities", indexes = {
        @Index(name = "idx_opp_status", columnList = "stage_id"),
        @Index(name = "idx_opp_agent", columnList = "assigned_agent_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Opportunity extends BaseEntity {

    public enum Priority {
        LOW, MEDIUM, HIGH, URGENT
    }

    @Column(nullable = false)
    private String title;

    @Column(unique = true, nullable = false)
    private String reference;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "contact_id", nullable = false)
    private Contact contact;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "property_id")
    private Property property;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pipeline_id", nullable = false)
    private Pipeline pipeline;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "stage_id", nullable = false)
    private PipelineStage stage;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_agent_id")
    private Employee assignedAgent;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private Priority priority = Priority.MEDIUM;

    private BigDecimal expectedValue;
    private LocalDate expectedCloseDate;

    @Builder.Default
    private int probability = 0;

    @Column(columnDefinition = "TEXT")
    private String notes;

    private String lostReason;

    @Builder.Default
    private int position = 0;
}
