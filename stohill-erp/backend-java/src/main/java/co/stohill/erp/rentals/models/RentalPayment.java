package co.stohill.erp.rentals.models;

import co.stohill.erp.core.models.BaseEntity;
import co.stohill.erp.finance.models.JournalEntry;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "rentals_payments")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RentalPayment extends BaseEntity {

    public enum PaymentMethod {
        EFT, CASH, CHEQUE, DEBIT_ORDER, CREDIT_CARD
    }

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "invoice_id", nullable = false)
    private RentalInvoice invoice;

    private LocalDate paymentDate;
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    private PaymentMethod paymentMethod;

    private String reference;

    @Column(columnDefinition = "TEXT")
    private String notes;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_entry_id")
    private JournalEntry journalEntry;
}
