package co.stohill.erp.rentals.models;

import co.stohill.erp.core.models.BaseEntity;
import co.stohill.erp.crm.models.Contact;
import co.stohill.erp.hr.models.Employee;
import co.stohill.erp.properties.models.Property;
import co.stohill.erp.properties.models.PropertyUnit;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "rentals_leases")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Lease extends BaseEntity {

    public enum LeaseStatus {
        DRAFT, PENDING_SIGNATURE, ACTIVE, EXPIRED, TERMINATED, RENEWED
    }

    public enum LeaseType {
        FIXED_TERM, MONTH_TO_MONTH, COMMERCIAL
    }

    @Column(name = "lease_number", unique = true, nullable = false)
    private String leaseNumber;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "property_id", nullable = false)
    private Property property;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "unit_id")
    private PropertyUnit unit;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "tenant_id", nullable = false)
    private Contact tenant;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private LeaseType leaseType = LeaseType.FIXED_TERM;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private LeaseStatus status = LeaseStatus.DRAFT;

    @Column(nullable = false)
    private LocalDate startDate;
    private LocalDate endDate;

    @Builder.Default
    private int noticePeriodDays = 30;

    @Column(nullable = false)
    private BigDecimal monthlyRental;

    @Builder.Default
    private BigDecimal rentalEscalationRate = new BigDecimal("8.00");

    @Builder.Default
    private BigDecimal depositAmount = BigDecimal.ZERO;
    @Builder.Default
    private boolean depositPaid = false;
    private LocalDate depositPaidDate;

    @Builder.Default
    private boolean vatApplicable = false;

    @Builder.Default
    private int invoiceDay = 1;
    @Builder.Default
    private int paymentDueDays = 3;

    private LocalDate nextInvoiceDate;
    private LocalDate lastInvoicedDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "managing_agent_id")
    private Employee managingAgent;

    @Column(columnDefinition = "TEXT")
    private String notes;
}
