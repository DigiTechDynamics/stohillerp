package co.stohill.erp.finance.repository;

import co.stohill.erp.finance.models.FiscalYear;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.UUID;

@Repository
public interface FiscalYearRepository extends JpaRepository<FiscalYear, UUID> {
}
