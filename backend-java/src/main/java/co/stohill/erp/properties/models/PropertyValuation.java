package co.stohill.erp.properties.models;

import co.stohill.erp.core.models.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "properties_valuations")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PropertyValuation extends BaseEntity {

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "property_id", nullable = false)
    private Property property;

    @Column(nullable = false)
    private LocalDate valuationDate;

    @Column(nullable = false)
    private BigDecimal valuationAmount;

    @Column(nullable = false)
    private String valuatorName;
    private String valuatorCompany;
    private String method;
    private String reportReference;

    @Column(columnDefinition = "TEXT")
    private String notes;
}
