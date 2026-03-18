package co.stohill.erp.finance.models;

import co.stohill.erp.core.models.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.*;

@Entity
@Table(name = "finance_journals")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Journal extends BaseEntity {

    @Column(unique = true, nullable = false)
    private String code;

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Builder.Default
    private boolean isActive = true;

    @Builder.Default
    private boolean autoPosting = false;

    public String getCode() {
        return code;
    }
}
