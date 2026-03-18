package co.stohill.erp.crm.models;

import co.stohill.erp.core.models.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "crm_pipelines")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Pipeline extends BaseEntity {

    public enum PipelineType {
        SALE, RENTAL, GENERAL
    }

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private PipelineType pipelineType = PipelineType.SALE;

    @Builder.Default
    private boolean isDefault = false;

    @Column(columnDefinition = "TEXT")
    private String description;

    @OneToMany(mappedBy = "pipeline", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    @Builder.Default
    private List<PipelineStage> stages = new ArrayList<>();
}
