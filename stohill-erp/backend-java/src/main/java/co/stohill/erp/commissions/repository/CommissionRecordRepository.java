package co.stohill.erp.commissions.repository;

import co.stohill.erp.commissions.models.CommissionRecord;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface CommissionRecordRepository extends JpaRepository<CommissionRecord, UUID> {
    Optional<CommissionRecord> findByReference(String reference);
}
