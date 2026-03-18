package co.stohill.erp.properties.models;

import co.stohill.erp.core.models.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Entity
@Table(name = "properties", indexes = {
        @Index(name = "idx_properties_status", columnList = "status"),
        @Index(name = "idx_properties_location", columnList = "city, suburb")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Property extends BaseEntity {

    public enum PropertyStatus {
        AVAILABLE, OCCUPIED, UNDER_CONTRACT, MAINTENANCE, LISTED_SALE, LISTED_RENT, SOLD, INACTIVE
    }

    public enum OwnershipType {
        OWNED, MANAGED, JV
    }

    @Column(name = "reference_number", unique = true, nullable = false)
    private String referenceNumber;

    @Column(nullable = false)
    private String name;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "property_type_id", nullable = false)
    private PropertyType propertyType;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private OwnershipType ownershipType = OwnershipType.OWNED;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private PropertyStatus status = PropertyStatus.AVAILABLE;

    // Location
    private String addressLine1;
    private String addressLine2;
    private String suburb;
    private String city;
    private String province;
    private String postalCode;
    @Builder.Default
    private String country = "South Africa";

    @Column(precision = 10, scale = 7)
    private BigDecimal latitude;
    @Column(precision = 10, scale = 7)
    private BigDecimal longitude;

    // Physical attributes
    private BigDecimal erfSize;
    private BigDecimal floorSize;
    private Integer bedrooms;
    private BigDecimal bathrooms;
    @Builder.Default
    private Integer garages = 0;
    @Builder.Default
    private Integer parkingBays = 0;
    private Integer yearBuilt;

    // Valuation
    private BigDecimal purchasePrice;
    private LocalDate purchaseDate;
    private BigDecimal currentValuation;
    private LocalDate lastValuationDate;
    private BigDecimal askingPrice;
    private BigDecimal rentalRate;

    // Utilities and Rates
    @Builder.Default
    private BigDecimal ratesMonthly = BigDecimal.ZERO;
    @Builder.Default
    private BigDecimal leviesMonthly = BigDecimal.ZERO;
    private BigDecimal bondAmount;
    private String bondInstitution;
    private BigDecimal bondMonthlyPayment;

    // Finance linkage
    private String glAccountCode;

    @Column(columnDefinition = "TEXT")
    private String description;

    @ElementCollection
    @CollectionTable(name = "property_features", joinColumns = @JoinColumn(name = "property_id"))
    @Column(name = "feature")
    private List<String> features;

    @Column(columnDefinition = "TEXT")
    private String notes;

    // Manual accessors to bypass Lombok build issues if any
    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public PropertyStatus getStatus() {
        return status;
    }

    public void setStatus(PropertyStatus status) {
        this.status = status;
    }

    public BigDecimal getCurrentValuation() {
        return currentValuation;
    }

    public void setCurrentValuation(BigDecimal currentValuation) {
        this.currentValuation = currentValuation;
    }
}
