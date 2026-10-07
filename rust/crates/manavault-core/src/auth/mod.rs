//! Owner authentication (`Manavault.Auth`): one password hash from
//! `MANAVAULT_ADMIN_PASSWORD_HASH`, or no authentication at all when
//! `MANAVAULT_AUTH_DISABLED=true`.
//!
//! The PBKDF2 hashing itself lives in [`crate::crypto`]; this module adds the
//! configuration checks, the login attempt limiter, and the `unban` command.

pub mod attempt_limiter;

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sha2::Sha256;

use crate::config::Config;

pub use attempt_limiter::{AttemptLimiter, Check, FailureOutcome};

/// `Auth.enabled?/0`.
#[must_use]
pub fn enabled(config: &Config) -> bool {
    !config.auth_disabled
}

/// `Auth.disabled?/0`.
#[must_use]
pub fn disabled(config: &Config) -> bool {
    config.auth_disabled
}

/// `Auth.configured?/0`: authentication is on and a password hash is set.
#[must_use]
pub fn configured(config: &Config) -> bool {
    enabled(config) && admin_password_hash(config).is_some()
}

/// The configured hash, with blank values treated as missing.
#[must_use]
pub fn admin_password_hash(config: &Config) -> Option<&str> {
    config
        .admin_password_hash
        .as_deref()
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
}

/// `Auth.verify_admin_password/1`.
#[must_use]
pub fn verify_admin_password(config: &Config, password: &str) -> bool {
    admin_password_hash(config).is_some_and(|hash| crate::crypto::verify_password(password, hash))
}

/// `Auth.admin_password_fingerprint/0`.
#[must_use]
pub fn admin_password_fingerprint(config: &Config) -> Option<String> {
    admin_password_hash(config).map(crate::crypto::password_fingerprint)
}

/// `Auth.hash_password(password, iterations: n, salt: salt)`: a hash with an
/// explicit work factor and salt. Tests use one iteration to stay fast.
#[must_use]
pub fn hash_password_with(password: &str, iterations: u32, salt: &[u8]) -> String {
    let mut digest = [0_u8; 32];
    pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), salt, iterations, &mut digest);
    format!(
        "pbkdf2_sha256${iterations}${}${}",
        URL_SAFE_NO_PAD.encode(salt),
        URL_SAFE_NO_PAD.encode(digest)
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::verify_password;

    #[test]
    fn hash_password_produces_a_verifiable_hash() {
        let hash = hash_password_with("correct horse", 1, b"salt-bytes");
        assert!(verify_password("correct horse", &hash));
        assert!(!verify_password("wrong", &hash));
        assert_eq!(
            hash_password_with("secret", 1, b"salt"),
            "pbkdf2_sha256$1$c2FsdA$ON9CizCTCOSMNofn-QvaDpzyU1aMIex1Sg4HarSrZCM"
        );
    }

    #[test]
    fn verify_password_rejects_malformed_hashes() {
        assert!(!verify_password("password", ""));
        assert!(!verify_password("password", "pbkdf2_sha256$nope$salt$hash"));
        assert!(!verify_password("password", "sha256$1$salt$hash"));
        assert!(!verify_password(
            "password",
            "pbkdf2_sha256$0$c2FsdA$aGFzaA"
        ));
    }

    #[test]
    fn fingerprint_is_stable_and_changes_when_the_hash_rotates() {
        let dir = crate::testing::TempDir::new();
        let mut config = Config::for_tests(dir.path().to_path_buf());
        config.admin_password_hash = Some(hash_password_with("first", 1, b"one"));
        let fingerprint = admin_password_fingerprint(&config).unwrap();
        assert_eq!(
            admin_password_fingerprint(&config),
            Some(fingerprint.clone())
        );
        config.admin_password_hash = Some(hash_password_with("replacement", 1, b"two"));
        assert_ne!(admin_password_fingerprint(&config), Some(fingerprint));
        config.admin_password_hash = Some("   ".to_owned());
        assert_eq!(admin_password_fingerprint(&config), None);
        config.auth_disabled = false;
        assert!(!configured(&config));
    }
}
