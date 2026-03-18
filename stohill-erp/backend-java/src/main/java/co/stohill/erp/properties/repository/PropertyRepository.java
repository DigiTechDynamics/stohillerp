package co.stohill.erp.properties.repository;

import co.stohill.erp.properties.models.Property;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface PropertyRepository extends JpaRepository<Property, UUID> {
    Optional<Property> findByReferenceNumber(String referenceNumber);
}
