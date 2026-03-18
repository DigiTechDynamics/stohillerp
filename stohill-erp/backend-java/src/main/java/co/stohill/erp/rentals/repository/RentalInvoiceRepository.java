package co.stohill.erp.rentals.repository;

import co.stohill.erp.rentals.models.RentalInvoice;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface RentalInvoiceRepository extends JpaRepository<RentalInvoice, UUID> {
    Optional<RentalInvoice> findByInvoiceNumber(String invoiceNumber);
}
