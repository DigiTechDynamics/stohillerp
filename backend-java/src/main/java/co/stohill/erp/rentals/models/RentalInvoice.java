package co.stohill.erp.rentals.models;

import co.stohill.erp.core.models.BaseEntity;
import co.stohill.erp.finance.models.JournalEntry;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "rentals_invoices")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RentalInvoice extends BaseEntity {

    public enum InvoiceStatus {
        DRAFT, SENT, PAID, OVERDUE, PARTIAL, CANCELLED
    }

    @Column(name = "invoice_number", unique = true, nullable = false)
    private String invoiceNumber;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "lease_id", nullable = false)
    private Lease lease;

    private LocalDate periodStart;
    private LocalDate periodEnd;
    private LocalDate dueDate;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private InvoiceStatus status = InvoiceStatus.DRAFT;

    private BigDecimal rentalAmount;
    @Builder.Default
    private BigDecimal vatAmount = BigDecimal.ZERO;
    @Builder.Default
    private BigDecimal latePaymentFee = BigDecimal.ZERO;
    private BigDecimal totalAmount;
    @Builder.Default
    private BigDecimal amountPaid = BigDecimal.ZERO;
    private BigDecimal balanceDue;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;

    @Builder.Default
    private boolean isPostedToFinance = false;
}
