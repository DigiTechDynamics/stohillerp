package co.stohill.erp.finance.models;

import co.stohill.erp.core.models.BaseEntity;
import co.stohill.erp.core.models.User;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "finance_fiscal_periods", uniqueConstraints = {
        @UniqueConstraint(columnNames = { "fiscal_year_id", "period_number" })
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class FiscalPeriod extends BaseEntity {

    public enum PeriodStatus {
        OPEN, LOCKED, CLOSED
    }

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "fiscal_year_id", nullable = false)
    private FiscalYear fiscalYear;

    @Column(nullable = false)
    private String name;

    @Column(name = "period_number", nullable = false)
    private int periodNumber;

    @Column(nullable = false)
    private LocalDate startDate;

    @Column(nullable = false)
    private LocalDate endDate;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private PeriodStatus status = PeriodStatus.OPEN;

    private LocalDateTime lockedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "locked_by_id")
    private User lockedBy;

    public boolean isOpenForPosting() {
        return status == PeriodStatus.OPEN && !fiscalYear.isClosed();
    }

    public PeriodStatus getStatus() {
        return status;
    }

    public FiscalYear getFiscalYear() {
        return fiscalYear;
    }
}
