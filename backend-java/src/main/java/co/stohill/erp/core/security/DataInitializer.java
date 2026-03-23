package co.stohill.erp.core.security;

import co.stohill.erp.core.models.Role;
import co.stohill.erp.core.models.User;
import co.stohill.erp.core.repository.RoleRepository;
import co.stohill.erp.core.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final RoleRepository roleRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        if (roleRepository.count() == 0) {
            seedRoles();
        }
        if (userRepository.count() == 0) {
            seedAdminUser();
        }
    }

    @SuppressWarnings("null")
    private void seedRoles() {
        for (Role.RoleType type : Role.RoleType.values()) {
            Role role = Role.builder()
                    .name(type.name().replace("_", " "))
                    .roleType(type)
                    .description("Default " + type.name() + " role")
                    .canViewProperties(true)
                    .canViewDashboard(true)
                    .canViewDocuments(true)
                    .build();

            if (type == Role.RoleType.SUPER_ADMIN || type == Role.RoleType.ADMIN) {
                role.setCanEditProperties(true);
                role.setCanEditFinance(true);
                role.setCanPostJournal(true);
                role.setCanApproveCommissions(true);
                role.setCanManageDocuments(true);
                role.setCanViewExecutiveDashboard(true);
            }

            roleRepository.save(role);
        }
    }

    @SuppressWarnings("null")
    private void seedAdminUser() {
        Role superAdminRole = roleRepository.findByRoleType(Role.RoleType.SUPER_ADMIN).orElseThrow();

        User admin = User.builder()
                .email("admin@stohill.co.za")
                .password(passwordEncoder.encode("admin123!"))
                .firstName("System")
                .lastName("Administrator")
                .status(User.UserStatus.ACTIVE)
                .isActive(true)
                .isStaff(true)
                .roles(Set.of(superAdminRole))
                .dateJoined(LocalDateTime.now())
                .build();

        userRepository.save(admin);
    }
}
