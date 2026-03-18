package co.stohill.erp.commissions.models;

import co.stohill.erp.core.models.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "commission_structures")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CommissionStructure extends BaseEntity {

    public enum TransactionType {
        SALE, RENTAL, COMMERCIAL
    }

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private TransactionType transactionType;

    @Column(nullable = false)
    private BigDecimal companyRate;

    @Column(nullable = false)
    private BigDecimal agentSplit;

    @Builder.Default
    private boolean isDefault = false;
}
