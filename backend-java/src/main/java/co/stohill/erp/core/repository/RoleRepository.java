package co.stohill.erp.core.repository;

import co.stohill.erp.core.models.Role;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface RoleRepository extends JpaRepository<Role, UUID> {
    Optional<Role> findByRoleType(Role.RoleType roleType);
}
