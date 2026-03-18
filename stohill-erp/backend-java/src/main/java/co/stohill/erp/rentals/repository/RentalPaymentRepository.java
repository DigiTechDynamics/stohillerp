package co.stohill.erp.rentals.repository;

import co.stohill.erp.rentals.models.RentalPayment;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface RentalPaymentRepository extends JpaRepository<RentalPayment, UUID> {
}
