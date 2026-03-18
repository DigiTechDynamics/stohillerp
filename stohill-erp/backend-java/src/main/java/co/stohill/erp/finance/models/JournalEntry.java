package co.stohill.erp.finance.models;

import co.stohill.erp.core.models.BaseEntity;
import co.stohill.erp.core.models.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "finance_journal_entries", indexes = {
        @Index(name = "idx_je_status_date", columnList = "status, entry_date"),
        @Index(name = "idx_je_source", columnList = "source_module, source_id")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class JournalEntry extends BaseEntity {

    public enum EntryStatus {
        DRAFT, PENDING_APPROVAL, APPROVED, POSTED, REVERSED, CANCELLED
    }

    public enum EntryType {
        MANUAL, SALES, RENTAL, COMMISSION, PAYROLL, DEPRECIATION, ADJUSTMENT, REVERSAL, OPENING_BALANCE
    }

    @Column(unique = true, nullable = false)
    private String reference;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "journal_id", nullable = false)
    private Journal journal;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "fiscal_period_id", nullable = false)
    private FiscalPeriod fiscalPeriod;

    @Enumerated(EnumType.STRING)
    private EntryType entryType = EntryType.MANUAL;

    @Enumerated(EnumType.STRING)
    private EntryStatus status = EntryStatus.DRAFT;

    @Column(name = "entry_date", nullable = false)
    private LocalDate entryDate;

    @Column(nullable = false)
    private String description;

    @Column(columnDefinition = "TEXT")
    private String narration;

    @Column(name = "source_module")
    private String sourceModule;
    @Column(name = "source_id")
    private UUID sourceId;
    @Column(name = "source_reference")
    private String sourceReference;

    private LocalDateTime postedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "posted_by_id")
    private User postedBy;

    private boolean isReversal = false;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reversed_entry_id")
    private JournalEntry reversedEntry;

    @OneToMany(mappedBy = "entry", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<JournalLine> lines = new ArrayList<>();

    public void setLines(List<JournalLine> lines) {
        this.lines = lines;
    }

    public List<JournalLine> getLines() {
        return lines;
    }

    // Manual Accessors
    public String getReference() {
        return reference;
    }

    public void setReference(String reference) {
        this.reference = reference;
    }

    public Journal getJournal() {
        return journal;
    }

    public void setJournal(Journal journal) {
        this.journal = journal;
    }

    public FiscalPeriod getFiscalPeriod() {
        return fiscalPeriod;
    }

    public void setFiscalPeriod(FiscalPeriod fiscalPeriod) {
        this.fiscalPeriod = fiscalPeriod;
    }

    public LocalDate getEntryDate() {
        return entryDate;
    }

    public void setEntryDate(LocalDate entryDate) {
        this.entryDate = entryDate;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public void setSourceModule(String sourceModule) {
        this.sourceModule = sourceModule;
    }

    public void setSourceId(UUID sourceId) {
        this.sourceId = sourceId;
    }

    public void setSourceReference(String sourceReference) {
        this.sourceReference = sourceReference;
    }

    public void setStatus(EntryStatus status) {
        this.status = status;
    }

    public void setPostedAt(LocalDateTime postedAt) {
        this.postedAt = postedAt;
    }

    public void setPostedBy(User postedBy) {
        this.postedBy = postedBy;
    }

    public void setEntryType(EntryType entryType) {
        this.entryType = entryType;
    }

    public void setNarration(String narration) {
        this.narration = narration;
    }

    // Manual Builder
    public static JournalEntryBuilder builder() {
        return new JournalEntryBuilder();
    }

    public static class JournalEntryBuilder {
        private String reference;
        private Journal journal;
        private FiscalPeriod fiscalPeriod;
        private LocalDate entryDate;
        private String description;
        private String sourceModule;
        private UUID sourceId;
        private String sourceReference;
        private EntryStatus status;
        private LocalDateTime postedAt;
        private User postedBy;

        public JournalEntryBuilder reference(String reference) {
            this.reference = reference;
            return this;
        }

        public JournalEntryBuilder journal(Journal journal) {
            this.journal = journal;
            return this;
        }

        public JournalEntryBuilder fiscalPeriod(FiscalPeriod fiscalPeriod) {
            this.fiscalPeriod = fiscalPeriod;
            return this;
        }

        public JournalEntryBuilder entryDate(LocalDate entryDate) {
            this.entryDate = entryDate;
            return this;
        }

        public JournalEntryBuilder description(String description) {
            this.description = description;
            return this;
        }

        public JournalEntryBuilder sourceModule(String sourceModule) {
            this.sourceModule = sourceModule;
            return this;
        }

        public JournalEntryBuilder sourceId(UUID sourceId) {
            this.sourceId = sourceId;
            return this;
        }

        public JournalEntryBuilder sourceReference(String sourceReference) {
            this.sourceReference = sourceReference;
            return this;
        }

        public JournalEntryBuilder status(EntryStatus status) {
            this.status = status;
            return this;
        }

        public JournalEntryBuilder postedAt(LocalDateTime postedAt) {
            this.postedAt = postedAt;
            return this;
        }

        public JournalEntryBuilder postedBy(User postedBy) {
            this.postedBy = postedBy;
            return this;
        }

        public JournalEntry build() {
            JournalEntry entry = new JournalEntry();
            entry.setReference(reference);
            entry.setJournal(journal);
            entry.setFiscalPeriod(fiscalPeriod);
            entry.setEntryDate(entryDate);
            entry.setDescription(description);
            entry.setSourceModule(sourceModule);
            entry.setSourceId(sourceId);
            entry.setSourceReference(sourceReference);
            if (status != null)
                entry.setStatus(status);
            entry.setPostedAt(postedAt);
            entry.setPostedBy(postedBy);
            return entry;
        }
    }
}
