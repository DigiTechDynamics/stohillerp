package co.stohill.erp.core.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

public class AuthDto {

    @Data
    @Builder
    @AllArgsConstructor
    @NoArgsConstructor
    public static class LoginRequest {
        private String email;
        private String password;

        public String getEmail() {
            return email;
        }

        public String getPassword() {
            return password;
        }

        public void setEmail(String email) {
            this.email = email;
        }

        public void setPassword(String password) {
            this.password = password;
        }
    }

    public static class AuthResponse {
        private String accessToken;
        private String refreshToken;
        private UserDto user;

        public String getAccessToken() {
            return accessToken;
        }

        public void setAccessToken(String accessToken) {
            this.accessToken = accessToken;
        }

        public String getRefreshToken() {
            return refreshToken;
        }

        public void setRefreshToken(String refreshToken) {
            this.refreshToken = refreshToken;
        }

        public UserDto getUser() {
            return user;
        }

        public void setUser(UserDto user) {
            this.user = user;
        }

        public static AuthResponseBuilder builder() {
            return new AuthResponseBuilder();
        }

        public static class AuthResponseBuilder {
            private String accessToken, refreshToken;
            private UserDto user;

            public AuthResponseBuilder accessToken(String accessToken) {
                this.accessToken = accessToken;
                return this;
            }

            public AuthResponseBuilder refreshToken(String refreshToken) {
                this.refreshToken = refreshToken;
                return this;
            }

            public AuthResponseBuilder user(UserDto user) {
                this.user = user;
                return this;
            }

            public AuthResponse build() {
                AuthResponse r = new AuthResponse();
                r.setAccessToken(accessToken);
                r.setRefreshToken(refreshToken);
                r.setUser(user);
                return r;
            }
        }
    }

    public static class UserDto {
        private String email, firstName, lastName, fullName;
        private boolean executiveMode;

        public String getEmail() {
            return email;
        }

        public void setEmail(String email) {
            this.email = email;
        }

        public String getFirstName() {
            return firstName;
        }

        public void setFirstName(String firstName) {
            this.firstName = firstName;
        }

        public String getLastName() {
            return lastName;
        }

        public void setLastName(String lastName) {
            this.lastName = lastName;
        }

        public String getFullName() {
            return fullName;
        }

        public void setFullName(String fullName) {
            this.fullName = fullName;
        }

        public boolean isExecutiveMode() {
            return executiveMode;
        }

        public void setExecutiveMode(boolean executiveMode) {
            this.executiveMode = executiveMode;
        }

        public static UserDtoBuilder builder() {
            return new UserDtoBuilder();
        }

        public static class UserDtoBuilder {
            private String email, firstName, lastName, fullName;
            private boolean executiveMode;

            public UserDtoBuilder email(String email) {
                this.email = email;
                return this;
            }

            public UserDtoBuilder firstName(String firstName) {
                this.firstName = firstName;
                return this;
            }

            public UserDtoBuilder lastName(String lastName) {
                this.lastName = lastName;
                return this;
            }

            public UserDtoBuilder fullName(String fullName) {
                this.fullName = fullName;
                return this;
            }

            public UserDtoBuilder executiveMode(boolean executiveMode) {
                this.executiveMode = executiveMode;
                return this;
            }

            public UserDto build() {
                UserDto d = new UserDto();
                d.setEmail(email);
                d.setFirstName(firstName);
                d.setLastName(lastName);
                d.setFullName(fullName);
                d.setExecutiveMode(executiveMode);
                return d;
            }
        }
    }
}
