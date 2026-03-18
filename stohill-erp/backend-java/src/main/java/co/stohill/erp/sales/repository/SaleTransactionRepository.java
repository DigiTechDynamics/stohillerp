package co.stohill.erp.sales.repository;

import co.stohill.erp.sales.models.SaleTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface SaleTransactionRepository extends JpaRepository<SaleTransaction, UUID> {
    Optional<SaleTransaction> findBySaleReference(String saleReference);
}
