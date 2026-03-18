package co.stohill.erp.finance.repository;

import co.stohill.erp.finance.models.*;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface ChartOfAccountRepository extends JpaRepository<ChartOfAccount, UUID> {
    Optional<ChartOfAccount> findByCode(String code);
}
