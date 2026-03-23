package co.stohill.erp.commissions.repository;

import co.stohill.erp.commissions.models.CommissionStructure;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface CommissionStructureRepository extends JpaRepository<CommissionStructure, UUID> {
}
