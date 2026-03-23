package co.stohill.erp.core.service;

import co.stohill.erp.core.dto.AuthDto;
import co.stohill.erp.core.models.User;
import co.stohill.erp.core.repository.UserRepository;
import co.stohill.erp.core.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Service;


@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final AuthenticationManager authenticationManager;

    public AuthDto.AuthResponse login(AuthDto.LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(
                        request.getEmail(),
                        request.getPassword()));
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow();

        user.setLastLoginIp("127.0.0.1"); // Simple mock for now
        userRepository.save(user);

        String jwtToken = jwtService.generateToken(user);

        return AuthDto.AuthResponse.builder()
                .accessToken(jwtToken)
                .refreshToken(jwtToken) // Simple mock for now
                .user(AuthDto.UserDto.builder()
                        .email(user.getEmail())
                        .firstName(user.getFirstName())
                        .lastName(user.getLastName())
                        .fullName(user.getFullName())
                        .executiveMode(user.isExecutiveMode())
                        .build())
                .build();
    }
}
