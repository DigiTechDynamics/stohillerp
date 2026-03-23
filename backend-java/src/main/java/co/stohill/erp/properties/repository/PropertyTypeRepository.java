package co.stohill.erp.properties.repository;

import co.stohill.erp.properties.models.PropertyType;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface PropertyTypeRepository extends JpaRepository<PropertyType, UUID> {
    Optional<PropertyType> findByCode(String code);
}
