package co.stohill.erp.commissions.models;

import co.stohill.erp.core.models.BaseEntity;
import co.stohill.erp.core.models.User;
import co.stohill.erp.hr.models.Employee;
import co.stohill.erp.properties.models.Property;
import co.stohill.erp.sales.models.SaleTransaction;
import co.stohill.erp.rentals.models.Lease;
import co.stohill.erp.finance.models.JournalEntry;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "commission_records")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CommissionRecord extends BaseEntity {

    public enum CommissionStatus {
        CALCULATED, PENDING, APPROVED, PAID, DISPUTED, CANCELLED
    }

    @Column(unique = true, nullable = false)
    private String reference;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "agent_id", nullable = false)
    private Employee agent;

    @Column(nullable = false)
    private String transactionType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sale_transaction_id")
    private SaleTransaction saleTransaction;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lease_id")
    private Lease lease;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "property_id", nullable = false)
    private Property property;

    private BigDecimal transactionAmount;
    private BigDecimal companyCommissionRate;
    private BigDecimal companyCommissionAmount;
    private BigDecimal agentSplitRate;
    private BigDecimal grossCommission;
    @Builder.Default
    private BigDecimal deductions = BigDecimal.ZERO;
    private BigDecimal netCommission;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private CommissionStatus status = CommissionStatus.CALCULATED;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "approved_by_id")
    private User approvedBy;

    private LocalDate approvedDate;
    private LocalDate paymentDate;
    private String paymentReference;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Column(columnDefinition = "TEXT")
    private String notes;
}
