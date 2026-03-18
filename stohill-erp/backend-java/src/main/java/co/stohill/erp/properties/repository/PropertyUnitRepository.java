package co.stohill.erp.properties.repository;

import co.stohill.erp.properties.models.Property;
import co.stohill.erp.properties.models.PropertyUnit;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface PropertyUnitRepository extends JpaRepository<PropertyUnit, UUID> {
    List<PropertyUnit> findByProperty(Property property);
}
