package co.stohill.erp.core.repository;

import co.stohill.erp.core.models.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {
}
