package co.stohill.erp.crm.repository;

import co.stohill.erp.crm.models.Opportunity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface OpportunityRepository extends JpaRepository<Opportunity, UUID> {
    Optional<Opportunity> findByReference(String reference);
}
