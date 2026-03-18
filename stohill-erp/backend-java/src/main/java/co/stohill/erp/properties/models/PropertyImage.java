package co.stohill.erp.properties.models;

import co.stohill.erp.core.models.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "properties_images")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PropertyImage extends BaseEntity {

    public enum ImageCategory {
        EXTERIOR, INTERIOR, FLOOR_PLAN, AERIAL, OTHER
    }

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "property_id", nullable = false)
    private Property property;

    @Column(name = "image_url", nullable = false)
    private String imageUrl;

    private String caption;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private ImageCategory category = ImageCategory.INTERIOR;

    @Builder.Default
    private boolean isPrimary = false;

    @Builder.Default
    private int sortOrder = 0;
}
