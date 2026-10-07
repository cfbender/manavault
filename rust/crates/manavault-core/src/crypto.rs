//! Stored-data cryptography. Both formats are kept stable across releases so
//! a database or backup written by any release still reads:
//!
//! - [`encrypt_secret`] / [`decrypt_secret`]: credentials in the database
//!   (`enc.v1.`, AES-256-GCM under a key derived from the secret key).
//! - [`hash_password`] / [`verify_password`]: the owner password
//!   (`pbkdf2_sha256$iterations$salt$hash`).
//!
//! Session cookies live in [`crate::web::session`].

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

const SECRET_PREFIX: &str = "enc.v1.";
const SECRET_AAD: &[u8] = b"manavault.encrypted.binary";

fn secret_key(secret: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"manavault.encrypted.binary.v1:");
    hasher.update(secret.as_bytes());
    hasher.finalize().into()
}

/// Random bytes from the OS generator.
#[must_use]
pub fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0_u8; N];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    bytes
}

/// Encrypts a stored credential as `"enc.v1." <> base64(iv <> tag <> ciphertext)`.
#[must_use]
pub fn encrypt_secret(secret: &str, plaintext: &str) -> Option<String> {
    let cipher = Aes256Gcm::new_from_slice(&secret_key(secret)).ok()?;
    let iv = random_bytes::<12>();
    let sealed = cipher
        .encrypt(
            &Nonce::from(iv),
            Payload {
                msg: plaintext.as_bytes(),
                aad: SECRET_AAD,
            },
        )
        .ok()?;
    // aes-gcm appends the 16-byte tag; the stored layout puts it before the ciphertext.
    let split = sealed.len().checked_sub(16)?;
    let (ciphertext, tag) = sealed.split_at(split);
    let mut packed = Vec::with_capacity(12 + sealed.len());
    packed.extend_from_slice(&iv);
    packed.extend_from_slice(tag);
    packed.extend_from_slice(ciphertext);
    Some(format!("{SECRET_PREFIX}{}", STANDARD.encode(packed)))
}

/// Decrypts a stored credential. Legacy plaintext is returned as-is; ciphertext
/// that does not decrypt (rotated secret key) reads as `None`.
#[must_use]
pub fn decrypt_secret(secret: &str, stored: &str) -> Option<String> {
    let Some(encoded) = stored.strip_prefix(SECRET_PREFIX) else {
        return Some(stored.to_owned());
    };
    let packed = STANDARD.decode(encoded).ok()?;
    let iv: [u8; 12] = packed.get(..12)?.try_into().ok()?;
    let tag = packed.get(12..28)?;
    let ciphertext = packed.get(28..)?;
    let mut sealed = Vec::with_capacity(ciphertext.len() + 16);
    sealed.extend_from_slice(ciphertext);
    sealed.extend_from_slice(tag);
    let cipher = Aes256Gcm::new_from_slice(&secret_key(secret)).ok()?;
    let plaintext = cipher
        .decrypt(
            &Nonce::from(iv),
            Payload {
                msg: &sealed,
                aad: SECRET_AAD,
            },
        )
        .ok()?;
    String::from_utf8(plaintext).ok()
}

#[must_use]
pub fn hmac_sha256(key: &[u8], message: &[u8]) -> Vec<u8> {
    match <HmacSha256 as Mac>::new_from_slice(key) {
        Ok(mut mac) => {
            mac.update(message);
            mac.finalize().into_bytes().to_vec()
        }
        Err(_) => Vec::new(),
    }
}

/// Constant-time equality.
#[must_use]
pub fn secure_compare(left: &[u8], right: &[u8]) -> bool {
    left.len() == right.len()
        && left
            .iter()
            .zip(right)
            .fold(0_u8, |acc, (a, b)| acc | (a ^ b))
            == 0
}

const PASSWORD_ALGORITHM: &str = "pbkdf2_sha256";
const PASSWORD_ITERATIONS: u32 = 210_000;

/// Hashes the owner password as `pbkdf2_sha256$iterations$salt$hash`.
#[must_use]
pub fn hash_password(password: &str) -> String {
    let salt = random_bytes::<16>();
    let mut digest = [0_u8; 32];
    pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, PASSWORD_ITERATIONS, &mut digest);
    format!(
        "{PASSWORD_ALGORITHM}${PASSWORD_ITERATIONS}${}${}",
        URL_SAFE_NO_PAD.encode(salt),
        URL_SAFE_NO_PAD.encode(digest)
    )
}

/// Checks a password against a stored `pbkdf2_sha256` hash.
#[must_use]
pub fn verify_password(password: &str, encoded: &str) -> bool {
    let parts: Vec<&str> = encoded.split('$').collect();
    let [algorithm, iterations, salt, digest] = parts.as_slice() else {
        return false;
    };
    if *algorithm != PASSWORD_ALGORITHM {
        return false;
    }
    let Ok(iterations) = iterations.parse::<u32>() else {
        return false;
    };
    if iterations == 0 {
        return false;
    }
    let (Ok(salt), Ok(expected)) = (URL_SAFE_NO_PAD.decode(salt), URL_SAFE_NO_PAD.decode(digest))
    else {
        return false;
    };
    let mut actual = [0_u8; 32];
    pbkdf2::pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, iterations, &mut actual);
    secure_compare(&actual, &expected)
}

/// The first 16 bytes of SHA-256 over the configured hash, so changing the
/// password signs every session out.
#[must_use]
pub fn password_fingerprint(hash: &str) -> String {
    let digest = Sha256::digest(hash.as_bytes());
    URL_SAFE_NO_PAD.encode(digest.get(..16).unwrap_or_default())
}

/// Lowercase hex SHA-256.
#[must_use]
pub fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "UsvngUheE20ovBxVkk8mYUrhf1l5zpBV+Pe5DVeypCZK0QnQde9NDUj1YhFADst6";

    #[test]
    fn secrets_round_trip_and_tolerate_plaintext() {
        let stored = encrypt_secret(SECRET, "sk-123").unwrap();
        assert!(stored.starts_with("enc.v1."));
        assert_eq!(decrypt_secret(SECRET, &stored).as_deref(), Some("sk-123"));
        assert_eq!(decrypt_secret("other", &stored), None);
        assert_eq!(decrypt_secret(SECRET, "legacy").as_deref(), Some("legacy"));
    }

    #[test]
    fn decrypts_a_value_written_by_earlier_releases() {
        // Written by the 1.x release (`Manavault.Encrypted.Binary`) under the
        // test secret key.
        let stored = "enc.v1./vn7j1SNmfpWIcshuLeTbZaAcpaa1nxxNt9ecQmCnJDK";
        assert_eq!(decrypt_secret(SECRET, stored).as_deref(), Some("hello"));
    }

    #[test]
    fn passwords_verify() {
        let hash = hash_password("hunter2");
        assert!(verify_password("hunter2", &hash));
        assert!(!verify_password("hunter3", &hash));
        // Hashed by the 1.x release with one iteration and the salt "salt".
        assert!(verify_password(
            "secret",
            "pbkdf2_sha256$1$c2FsdA$ON9CizCTCOSMNofn-QvaDpzyU1aMIex1Sg4HarSrZCM"
        ));
    }
}
