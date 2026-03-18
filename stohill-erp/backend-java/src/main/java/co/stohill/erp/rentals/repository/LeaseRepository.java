package co.stohill.erp.rentals.repository;

import co.stohill.erp.rentals.models.Lease;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface LeaseRepository extends JpaRepository<Lease, UUID> {
    Optional<Lease> findByLeaseNumber(String leaseNumber);
}
