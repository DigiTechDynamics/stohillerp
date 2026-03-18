package co.stohill.erp.finance.models;

import co.stohill.erp.core.models.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "finance_chart_of_accounts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChartOfAccount extends BaseEntity {

    public enum AccountType {
        ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE, CONTRA
    }

    public enum AccountSubType {
        CURRENT_ASSET, FIXED_ASSET, INVESTMENT, BANK, RECEIVABLE,
        CURRENT_LIABILITY, LONG_TERM_LIABILITY, PAYABLE, TAX_LIABILITY,
        RETAINED_EARNINGS, SHARE_CAPITAL,
        OPERATING_REVENUE, OTHER_INCOME,
        OPERATING_EXPENSE, COST_OF_SALES, ADMIN_EXPENSE, DEPRECIATION
    }

    @Column(unique = true, nullable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AccountType accountType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private AccountSubType accountSubType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "parent_id")
    private ChartOfAccount parent;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Builder.Default
    private boolean isActive = true;

    @Builder.Default
    private boolean isSystem = false;

    @Builder.Default
    private String currency = "ZAR";

    @Builder.Default
    private boolean allowDirectPosting = true;

    @Builder.Default
    private BigDecimal currentBalance = BigDecimal.ZERO;

    public String getNormalBalance() {
        if (accountType == AccountType.ASSET || accountType == AccountType.EXPENSE
                || accountType == AccountType.CONTRA) {
            return "debit";
        }
        return "credit";
    }

    public BigDecimal getCurrentBalance() {
        return currentBalance;
    }

    public void setCurrentBalance(BigDecimal currentBalance) {
        this.currentBalance = currentBalance;
    }

    public boolean isAllowDirectPosting() {
        return allowDirectPosting;
    }

    public String getCode() {
        return code;
    }
}
