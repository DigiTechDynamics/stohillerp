package co.stohill.erp.finance.repository;

import co.stohill.erp.finance.models.Journal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface JournalRepository extends JpaRepository<Journal, UUID> {
    Optional<Journal> findByCode(String code);
}
