package co.stohill.erp.finance.service;

import co.stohill.erp.core.models.User;
import co.stohill.erp.finance.models.*;
import co.stohill.erp.finance.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AccountingService {

    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AccountingService.class);

    private final ChartOfAccountRepository accountRepository;
    private final JournalRepository journalRepository;
    private final JournalEntryRepository entryRepository;
    private final FiscalPeriodRepository periodRepository;

    public static class PostingRequest {
        private String description;
        private LocalDate entryDate;
        private String sourceModule;
        private UUID sourceId;
        private String sourceReference;
        private List<LineRequest> lines;

        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
        }

        public LocalDate getEntryDate() {
            return entryDate;
        }

        public void setEntryDate(LocalDate entryDate) {
            this.entryDate = entryDate;
        }

        public String getSourceModule() {
            return sourceModule;
        }

        public void setSourceModule(String sourceModule) {
            this.sourceModule = sourceModule;
        }

        public UUID getSourceId() {
            return sourceId;
        }

        public void setSourceId(UUID sourceId) {
            this.sourceId = sourceId;
        }

        public String getSourceReference() {
            return sourceReference;
        }

        public void setSourceReference(String sourceReference) {
            this.sourceReference = sourceReference;
        }

        public List<LineRequest> getLines() {
            return lines;
        }

        public void setLines(List<LineRequest> lines) {
            this.lines = lines;
        }

        public BigDecimal getTotalDebits() {
            return lines.stream()
                    .filter(l -> l.getSide() == JournalLine.LineSide.DEBIT)
                    .map(LineRequest::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }

        public BigDecimal getTotalCredits() {
            return lines.stream()
                    .filter(l -> l.getSide() == JournalLine.LineSide.CREDIT)
                    .map(LineRequest::getAmount)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        }

        public boolean isBalanced() {
            return getTotalDebits().compareTo(getTotalCredits()) == 0;
        }

        public static PostingRequestBuilder builder() {
            return new PostingRequestBuilder();
        }

        public static class PostingRequestBuilder {
            private PostingRequest r = new PostingRequest();

            public PostingRequestBuilder description(String d) {
                r.setDescription(d);
                return this;
            }

            public PostingRequestBuilder entryDate(LocalDate d) {
                r.setEntryDate(d);
                return this;
            }

            public PostingRequestBuilder sourceModule(String m) {
                r.setSourceModule(m);
                return this;
            }

            public PostingRequestBuilder sourceId(UUID id) {
                r.setSourceId(id);
                return this;
            }

            public PostingRequestBuilder sourceReference(String ref) {
                r.setSourceReference(ref);
                return this;
            }

            public PostingRequestBuilder lines(List<LineRequest> lines) {
                r.setLines(lines);
                return this;
            }

            public PostingRequest build() {
                return r;
            }
        }
    }

    public static class LineRequest {
        private String accountCode;
        private JournalLine.LineSide side;
        private BigDecimal amount;
        private String description;
        private co.stohill.erp.properties.models.Property property;

        public String getAccountCode() {
            return accountCode;
        }

        public void setAccountCode(String accountCode) {
            this.accountCode = accountCode;
        }

        public JournalLine.LineSide getSide() {
            return side;
        }

        public void setSide(JournalLine.LineSide side) {
            this.side = side;
        }

        public BigDecimal getAmount() {
            return amount;
        }

        public void setAmount(BigDecimal amount) {
            this.amount = amount;
        }

        public String getDescription() {
            return description;
        }

        public void setDescription(String description) {
            this.description = description;
        }

        public co.stohill.erp.properties.models.Property getProperty() {
            return property;
        }

        public void setProperty(co.stohill.erp.properties.models.Property property) {
            this.property = property;
        }

        public static LineRequestBuilder builder() {
            return new LineRequestBuilder();
        }

        public static class LineRequestBuilder {
            private LineRequest r = new LineRequest();

            public LineRequestBuilder accountCode(String c) {
                r.setAccountCode(c);
                return this;
            }

            public LineRequestBuilder side(JournalLine.LineSide s) {
                r.setSide(s);
                return this;
            }

            public LineRequestBuilder amount(BigDecimal a) {
                r.setAmount(a);
                return this;
            }

            public LineRequestBuilder description(String d) {
                r.setDescription(d);
                return this;
            }

            public LineRequestBuilder property(co.stohill.erp.properties.models.Property p) {
                r.setProperty(p);
                return this;
            }

            public LineRequest build() {
                return r;
            }
        }
    }

    @Transactional
    public JournalEntry postEntry(PostingRequest request, String journalCode, User postedBy) {
        log.info("Posting journal entry: {} dated {}", request.getDescription(), request.getEntryDate());

        if (!request.isBalanced()) {
            throw new RuntimeException("Journal entry is not balanced. DR: " + request.getTotalDebits() + ", CR: "
                    + request.getTotalCredits());
        }

        Journal journal = journalRepository.findByCode(journalCode)
                .orElseThrow(() -> new RuntimeException("Journal not found: " + journalCode));

        FiscalPeriod period = periodRepository
                .findByStartDateLessThanEqualAndEndDateGreaterThanEqual(request.getEntryDate(), request.getEntryDate())
                .orElseThrow(
                        () -> new RuntimeException("No open fiscal period found for date: " + request.getEntryDate()));

        if (!period.isOpenForPosting()) {
            throw new RuntimeException("Fiscal period is not open for posting");
        }

        String reference = generateReference(journalCode);

        JournalEntry entry = JournalEntry.builder()
                .reference(reference)
                .journal(journal)
                .fiscalPeriod(period)
                .entryDate(request.getEntryDate())
                .description(request.getDescription())
                .sourceModule(request.getSourceModule())
                .sourceId(request.getSourceId())
                .sourceReference(request.getSourceReference())
                .status(JournalEntry.EntryStatus.POSTED)
                .postedAt(LocalDateTime.now())
                .postedBy(postedBy)
                .build();

        List<JournalLine> lines = new ArrayList<>();
        for (LineRequest lr : request.getLines()) {
            ChartOfAccount account = accountRepository.findByCode(lr.getAccountCode())
                    .orElseThrow(() -> new RuntimeException("Account not found: " + lr.getAccountCode()));

            if (!account.isAllowDirectPosting()) {
                throw new RuntimeException("Direct posting not allowed for account: " + lr.getAccountCode());
            }

            JournalLine line = JournalLine.builder()
                    .entry(entry)
                    .account(account)
                    .side(lr.getSide())
                    .amount(lr.getAmount())
                    .description(lr.getDescription())
                    .property(lr.getProperty())
                    .build();

            lines.add(line);
            updateAccountBalance(account, lr.getSide(), lr.getAmount());
        }
        entry.setLines(lines);

        return entryRepository.save(entry);
    }

    private String generateReference(String journalCode) {
        return journalCode + "-" + System.currentTimeMillis(); // Simple ref for now
    }

    private void updateAccountBalance(ChartOfAccount account, JournalLine.LineSide side, BigDecimal amount) {
        boolean isIncrease;
        if (side == JournalLine.LineSide.DEBIT) {
            isIncrease = account.getNormalBalance().equals("debit");
        } else {
            isIncrease = account.getNormalBalance().equals("credit");
        }

        if (isIncrease) {
            account.setCurrentBalance(account.getCurrentBalance().add(amount));
        } else {
            account.setCurrentBalance(account.getCurrentBalance().subtract(amount));
        }
        accountRepository.save(account);
    }
}
