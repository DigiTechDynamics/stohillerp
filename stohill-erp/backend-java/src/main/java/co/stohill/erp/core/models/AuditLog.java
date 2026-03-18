package co.stohill.erp.core.models;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "core_audit_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {

    public enum ActionType {
        CREATE, UPDATE, DELETE, VIEW, EXPORT, LOGIN, LOGOUT, POST, APPROVE, REJECT
    }

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ActionType action;

    @Column(name = "model_name", nullable = false)
    private String modelName;

    @Column(name = "object_id", nullable = false)
    private String objectId;

    @Column(name = "object_repr")
    private String objectRepr;

    @Column(columnDefinition = "JSON")
    private String changes;

    @Column(name = "ip_address")
    private String ipAddress;

    @Column(name = "user_agent", columnDefinition = "TEXT")
    private String userAgent;

    @CreationTimestamp
    private LocalDateTime timestamp;
}
