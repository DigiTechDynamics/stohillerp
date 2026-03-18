package co.stohill.erp.crm.repository;

import co.stohill.erp.crm.models.Pipeline;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface PipelineRepository extends JpaRepository<Pipeline, UUID> {
}
