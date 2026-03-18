package co.stohill.erp.crm.models;

import co.stohill.erp.core.models.BaseEntity;
import co.stohill.erp.hr.models.Employee;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

@Entity
@Table(name = "crm_contacts", indexes = {
        @Index(name = "idx_contact_type", columnList = "contact_type"),
        @Index(name = "idx_contact_status", columnList = "status")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Contact extends BaseEntity {

    public enum ContactType {
        LEAD, PROSPECT, BUYER, SELLER, TENANT, LANDLORD, INVESTOR, ATTORNEY, BANK, OTHER
    }

    public enum ContactStatus {
        ACTIVE, INACTIVE, BLACKLISTED
    }

    public enum Rating {
        HOT, WARM, COLD
    }

    @Column(name = "first_name", nullable = false)
    private String firstName;

    @Column(name = "last_name", nullable = false)
    private String lastName;

    private String company;
    private String idNumber;
    private String passportNumber;

    @Column(unique = true)
    private String email;

    private String phoneMobile;
    private String phoneWork;
    private String phoneHome;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private ContactType contactType = ContactType.LEAD;

    @Enumerated(EnumType.STRING)
    @Builder.Default
    private ContactStatus status = ContactStatus.ACTIVE;

    @Enumerated(EnumType.STRING)
    private Rating rating;

    private String source;

    // Address
    private String addressLine1;
    private String suburb;
    private String city;
    private String province;
    private String postalCode;

    // Financial
    private String creditRating;
    private BigDecimal affordability;
    private BigDecimal annualIncome;

    @Column(columnDefinition = "JSON")
    private String propertyPreferences;

    private BigDecimal budgetMin;
    private BigDecimal budgetMax;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assigned_agent_id")
    private Employee assignedAgent;

    @Column(columnDefinition = "TEXT")
    private String notes;

    private String avatarUrl;

    public String getFullName() {
        return firstName + " " + lastName;
    }

    public String getFirstName() {
        return firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public String getEmail() {
        return email;
    }

    public ContactStatus getStatus() {
        return status;
    }

    public void setFirstName(String firstName) { this.firstName = firstName; }
    public void setLastName(String lastName) { this.lastName = lastName; }
    public void setEmail(String email) { this.email = email; }
    public void setStatus(ContactStatus status) { this.status = status; }
}
