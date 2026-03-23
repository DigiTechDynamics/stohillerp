package co.stohill.erp.sales.models;

import co.stohill.erp.core.models.BaseEntity;
import co.stohill.erp.crm.models.Contact;
import co.stohill.erp.crm.models.Opportunity;
import co.stohill.erp.finance.models.JournalEntry;
import co.stohill.erp.hr.models.Employee;
import co.stohill.erp.properties.models.Property;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "sales_transactions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SaleTransaction extends BaseEntity {

    public enum TransactionStatus {
        OFFER_SUBMITTED, OFFER_ACCEPTED, SUSPENSIVE_CONDITIONS, BOND_APPROVED, TRANSFER_IN_PROGRESS, REGISTERED,
        CANCELLED
    }

    @Column(name = "sale_reference", unique = true, nullable = false)
    private String saleReference;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "property_id", nullable = false)
    private Property property;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "buyer_id", nullable = false)
    private Contact buyer;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "seller_id")
    private Contact seller;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "opportunity_id")
    private Opportunity opportunity;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "listing_agent_id")
    private Employee listingAgent;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "selling_agent_id")
    private Employee sellingAgent;

    @Column(nullable = false)
    private BigDecimal salePrice;

    @Builder.Default
    private BigDecimal depositAmount = BigDecimal.ZERO;
    private LocalDate depositDueDate;
    private LocalDate depositPaidDate;

    @Builder.Default
    private BigDecimal commissionRate = new BigDecimal("7.00");
    private BigDecimal commissionAmount;

    @Builder.Default
    private boolean bondRequired = true;
    private BigDecimal bondAmount;
    private String bondInstitution;
    private LocalDate bondApprovedDate;
    private Boolean bondGranted;

    @Column(nullable = false)
    private LocalDate offerDate;
    private LocalDate acceptedDate;
    private LocalDate occupationDate;
    private LocalDate transferDate;

    private String transferringAttorney;
    private String bondAttorney;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private TransactionStatus status = TransactionStatus.OFFER_SUBMITTED;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Builder.Default
    private boolean isPostedToFinance = false;

    @Column(columnDefinition = "TEXT")
    private String notes;

    public BigDecimal calculateCommission() {
        this.commissionAmount = salePrice.multiply(commissionRate).divide(new BigDecimal("100"));
        return this.commissionAmount;
    }
}
