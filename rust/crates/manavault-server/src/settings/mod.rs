//! Owner settings stored in singleton rows: appearance (`Manavault.Appearance`)
//! and AI provider settings (`Manavault.AI.Settings`).

pub mod ai;
pub mod appearance;
pub mod changeset;

/// Stored credentials use
/// `Manavault.Encrypted.Binary` (implemented in [`crate::crypto`]).
#[cfg(test)]
mod encrypted_tests {
    use crate::crypto::{decrypt_secret, encrypt_secret};
    use base64::Engine as _;

    const SECRET: &str = "UsvngUheE20ovBxVkk8mYUrhf1l5zpBV+Pe5DVeypCZK0QnQde9NDUj1YhFADst6";

    #[test]
    fn dump_prefixes_ciphertext_without_the_plaintext() {
        let dumped = encrypt_secret(SECRET, "super-secret-key").unwrap();
        assert!(dumped.starts_with("enc.v1."));
        assert!(!dumped.contains("super-secret-key"));
        assert_eq!(
            decrypt_secret(SECRET, &dumped).as_deref(),
            Some("super-secret-key")
        );
    }

    #[test]
    fn each_dump_uses_a_fresh_iv() {
        let a = encrypt_secret(SECRET, "same-value").unwrap();
        let b = encrypt_secret(SECRET, "same-value").unwrap();
        assert_ne!(a, b);
        assert_eq!(decrypt_secret(SECRET, &a).as_deref(), Some("same-value"));
        assert_eq!(decrypt_secret(SECRET, &b).as_deref(), Some("same-value"));
    }

    #[test]
    fn legacy_plaintext_loads_and_tampered_ciphertext_reads_as_none() {
        assert_eq!(
            decrypt_secret(SECRET, "legacy-plaintext").as_deref(),
            Some("legacy-plaintext")
        );
        let tampered = format!(
            "enc.v1.{}",
            base64::engine::general_purpose::STANDARD.encode(crate::crypto::random_bytes::<40>())
        );
        assert_eq!(decrypt_secret(SECRET, &tampered), None);
    }
}
