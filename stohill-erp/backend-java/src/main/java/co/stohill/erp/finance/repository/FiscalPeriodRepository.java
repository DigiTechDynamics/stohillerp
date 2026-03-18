package co.stohill.erp.finance.repository;

import co.stohill.erp.finance.models.FiscalPeriod;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface FiscalPeriodRepository extends JpaRepository<FiscalPeriod, UUID> {
    Optional<FiscalPeriod> findByStartDateLessThanEqualAndEndDateGreaterThanEqual(LocalDate date1, LocalDate date2);
}
