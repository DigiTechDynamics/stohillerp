package co.stohill.erp.hr.models;

import co.stohill.erp.core.models.BaseEntity;
import co.stohill.erp.core.models.User;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "hr_employees")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Employee extends BaseEntity {

    public enum EmploymentType {
        FULL_TIME, PART_TIME, CONTRACT, COMMISSION_ONLY, INTERN
    }

    public enum EmployeeStatus {
        ACTIVE, ON_LEAVE, SUSPENDED, TERMINATED
    }

    @Column(name = "employee_number", unique = true, nullable = false)
    private String employeeNumber;

    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "first_name", nullable = false)
    private String firstName;

    @Column(name = "last_name", nullable = false)
    private String lastName;

    @Column(nullable = false)
    private String email;

    private String phone;

    @Column(name = "photo_url")
    private String photoUrl;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "department_id")
    private Department department;

    @Column(name = "job_title")
    private String jobTitle;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private EmploymentType employmentType = EmploymentType.FULL_TIME;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private EmployeeStatus status = EmployeeStatus.ACTIVE;

    @Column(nullable = false)
    private LocalDate startDate;

    private LocalDate endDate;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reports_to_id")
    private Employee reportsTo;

    @Builder.Default
    private BigDecimal basicSalary = BigDecimal.ZERO;

    @Builder.Default
    private BigDecimal commissionRate = new BigDecimal("50.00");

    // Agent-specific
    private String fidelityFundNumber;
    private LocalDate fidelityFundExpiry;

    @Builder.Default
    private boolean principalAgent = false;

    // Bank details
    private String bankName;
    private String bankAccountNumber;
    private String bankBranchCode;

    @Column(columnDefinition = "TEXT")
    private String notes;

    public String getFullName() {
        return firstName + " " + lastName;
    }
}
