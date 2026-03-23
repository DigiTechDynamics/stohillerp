package co.stohill.erp.crm.models;

import co.stohill.erp.core.models.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "crm_pipeline_stages")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PipelineStage extends BaseEntity {

    public enum StageType {
        INITIAL, QUALIFIED, VIEWING, OFFER, NEGOTIATION, ACCEPTED, DUE_DILIGENCE, DOCUMENTATION, CLOSING, WON, LOST
    }

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pipeline_id", nullable = false)
    private Pipeline pipeline;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private StageType stageType;

    @Builder.Default
    private int position = 0;

    @Builder.Default
    private String color = "#E5A645";

    @Builder.Default
    private int probability = 0;

    @Builder.Default
    private boolean isTerminal = false;

    @Builder.Default
    private boolean isWon = false;
}
