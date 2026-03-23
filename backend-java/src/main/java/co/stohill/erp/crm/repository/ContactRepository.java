package co.stohill.erp.crm.repository;

import co.stohill.erp.crm.models.Contact;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface ContactRepository extends JpaRepository<Contact, UUID> {
    Optional<Contact> findByEmail(String email);
}
