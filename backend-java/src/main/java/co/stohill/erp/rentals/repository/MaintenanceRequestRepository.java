package co.stohill.erp.rentals.repository;

import co.stohill.erp.rentals.models.MaintenanceRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface MaintenanceRequestRepository extends JpaRepository<MaintenanceRequest, UUID> {
    Optional<MaintenanceRequest> findByReference(String reference);
}
