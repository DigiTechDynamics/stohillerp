package co.stohill.erp.properties.models;

import co.stohill.erp.core.models.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "properties_units", uniqueConstraints = {
        @UniqueConstraint(columnNames = { "property_id", "unit_number" })
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PropertyUnit extends BaseEntity {

    public enum UnitStatus {
        AVAILABLE, OCCUPIED, MAINTENANCE, RESERVED
    }

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "property_id", nullable = false)
    private Property property;

    @Column(name = "unit_number", nullable = false)
    private String unitNumber;

    private Integer floor;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private UnitStatus status = UnitStatus.AVAILABLE;

    private BigDecimal floorSize;
    private Integer bedrooms;
    private BigDecimal bathrooms;
    private BigDecimal monthlyRental;

    @Column(columnDefinition = "TEXT")
    private String notes;
}
