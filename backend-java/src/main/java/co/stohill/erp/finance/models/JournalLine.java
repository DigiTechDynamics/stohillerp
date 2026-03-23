package co.stohill.erp.finance.models;

import co.stohill.erp.core.models.BaseEntity;
import co.stohill.erp.properties.models.Property;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "finance_journal_lines")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class JournalLine extends BaseEntity {

    public enum LineSide {
        DEBIT, CREDIT
    }

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entry_id", nullable = false)
    private JournalEntry entry;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "account_id", nullable = false)
    private ChartOfAccount account;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private LineSide side;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    private String description;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "property_id")
    private Property property;

    @Column(precision = 12, scale = 2)
    private BigDecimal vatAmount = BigDecimal.ZERO;

    private String vatCode;

    // Manual Accessors
    public LineSide getSide() {
        return side;
    }

    public BigDecimal getAmount() {
        return amount;
    }

    public ChartOfAccount getAccount() {
        return account;
    }

    public void setEntry(JournalEntry entry) {
        this.entry = entry;
    }

    public void setAccount(ChartOfAccount account) {
        this.account = account;
    }

    public void setSide(LineSide side) {
        this.side = side;
    }

    public void setAmount(BigDecimal amount) {
        this.amount = amount;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public void setProperty(Property property) {
        this.property = property;
    }

    public void setVatAmount(BigDecimal vatAmount) {
        this.vatAmount = vatAmount;
    }

    public void setVatCode(String vatCode) {
        this.vatCode = vatCode;
    }

    // Manual Builder
    public static JournalLineBuilder builder() {
        return new JournalLineBuilder();
    }

    public static class JournalLineBuilder {
        private JournalEntry entry;
        private ChartOfAccount account;
        private LineSide side;
        private BigDecimal amount;
        private String description;
        private Property property;

        public JournalLineBuilder entry(JournalEntry entry) {
            this.entry = entry;
            return this;
        }

        public JournalLineBuilder account(ChartOfAccount account) {
            this.account = account;
            return this;
        }

        public JournalLineBuilder side(LineSide side) {
            this.side = side;
            return this;
        }

        public JournalLineBuilder amount(BigDecimal amount) {
            this.amount = amount;
            return this;
        }

        public JournalLineBuilder description(String description) {
            this.description = description;
            return this;
        }

        public JournalLineBuilder property(Property property) {
            this.property = property;
            return this;
        }

        public JournalLine build() {
            JournalLine line = new JournalLine();
            line.setEntry(entry);
            line.setAccount(account);
            line.setSide(side);
            line.setAmount(amount);
            line.setDescription(description);
            line.setProperty(property);
            return line;
        }
    }
}
