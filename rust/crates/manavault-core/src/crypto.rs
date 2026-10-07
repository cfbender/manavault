//! Cryptography compatible, byte for byte, with earlier releases, so a
//! database, backup, or browser session created by any release still works:
//!
//! - [`encrypt_secret`] / [`decrypt_secret`]: `Manavault.Encrypted.Binary`
//!   (AES-256-GCM, key derived from `secret_key_base`).
//! - [`SessionCodec`]: Plug's signed cookie session store with the
//!   `:external_term_format` serializer.
//! - [`csrf`]: `Plug.CSRFProtection` masked tokens.
//! - [`hash_password`] / [`verify_password`]: `Manavault.Auth` PBKDF2 hashes.

use std::collections::BTreeMap;

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use base64::Engine;
use base64::engine::general_purpose::{STANDARD, URL_SAFE, URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

const SECRET_PREFIX: &str = "enc.v1.";
const SECRET_AAD: &[u8] = b"manavault.encrypted.binary";

fn secret_key(secret_key_base: &str) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(b"manavault.encrypted.binary.v1:");
    hasher.update(secret_key_base.as_bytes());
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
pub fn encrypt_secret(secret_key_base: &str, plaintext: &str) -> Option<String> {
    let cipher = Aes256Gcm::new_from_slice(&secret_key(secret_key_base)).ok()?;
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
/// that does not decrypt (rotated `secret_key_base`) reads as `None`.
#[must_use]
pub fn decrypt_secret(secret_key_base: &str, stored: &str) -> Option<String> {
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
    let cipher = Aes256Gcm::new_from_slice(&secret_key(secret_key_base)).ok()?;
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

/// `Plug.Crypto.KeyGenerator.generate/3` with the default options
/// (PBKDF2-HMAC-SHA256, 1000 iterations, 32 bytes).
#[must_use]
pub fn derive_key(secret_key_base: &str, salt: &str) -> [u8; 32] {
    let mut key = [0_u8; 32];
    pbkdf2::pbkdf2_hmac::<Sha256>(secret_key_base.as_bytes(), salt.as_bytes(), 1000, &mut key);
    key
}

/// `Plug.Crypto.MessageVerifier.sign/2` with SHA-256.
#[must_use]
pub fn sign_message(payload: &[u8], key: &[u8]) -> String {
    let plain = format!("SFMyNTY.{}", URL_SAFE_NO_PAD.encode(payload));
    let signature = hmac_sha256(key, plain.as_bytes());
    format!("{plain}.{}", URL_SAFE_NO_PAD.encode(signature))
}

/// `Plug.Crypto.MessageVerifier.verify/2` for SHA-256 signatures.
#[must_use]
pub fn verify_message(signed: &str, key: &[u8]) -> Option<Vec<u8>> {
    let mut parts = signed.split('.');
    let (protected, payload, signature) = (parts.next()?, parts.next()?, parts.next()?);
    if parts.next().is_some() || protected != "SFMyNTY" {
        return None;
    }
    let signature = URL_SAFE_NO_PAD.decode(signature).ok()?;
    let mut mac = <HmacSha256 as Mac>::new_from_slice(key).ok()?;
    mac.update(format!("{protected}.{payload}").as_bytes());
    mac.verify_slice(&signature).ok()?;
    URL_SAFE_NO_PAD.decode(payload).ok()
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

/// A value stored in the session cookie.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SessionValue {
    Text(String),
    Bool(bool),
    Int(i64),
}

/// The decoded session: string keys, as Plug stores them.
pub type Session = BTreeMap<String, SessionValue>;

/// Plug's cookie session store (`Plug.Session.COOKIE`, signed, not encrypted).
#[derive(Clone)]
pub struct SessionCodec {
    key: [u8; 32],
}

impl SessionCodec {
    #[must_use]
    pub fn new(secret_key_base: &str, signing_salt: &str) -> Self {
        Self {
            key: derive_key(secret_key_base, signing_salt),
        }
    }

    /// Decodes a cookie; an invalid or tampered cookie is `None`.
    #[must_use]
    pub fn decode(&self, cookie: &str) -> Option<Session> {
        let payload = verify_message(cookie, &self.key)?;
        etf::decode_session(&payload)
    }

    #[must_use]
    pub fn encode(&self, session: &Session) -> String {
        sign_message(&etf::encode_session(session), &self.key)
    }
}

/// The subset of Erlang's external term format that Plug sessions use: a map
/// of binary keys to binaries, booleans, and small integers.
mod etf {
    use super::{Session, SessionValue};

    const VERSION: u8 = 131;
    const MAP: u8 = 116;
    const BINARY: u8 = 109;
    const SMALL_ATOM_UTF8: u8 = 119;
    const ATOM_UTF8: u8 = 118;
    const ATOM: u8 = 100;
    const SMALL_ATOM: u8 = 115;
    const SMALL_INTEGER: u8 = 97;
    const INTEGER: u8 = 98;

    struct Reader<'a> {
        bytes: &'a [u8],
    }

    impl<'a> Reader<'a> {
        fn u8(&mut self) -> Option<u8> {
            let (first, rest) = self.bytes.split_first()?;
            self.bytes = rest;
            Some(*first)
        }

        fn take(&mut self, len: usize) -> Option<&'a [u8]> {
            let taken = self.bytes.get(..len)?;
            self.bytes = self.bytes.get(len..)?;
            Some(taken)
        }

        fn u16(&mut self) -> Option<usize> {
            let bytes: [u8; 2] = self.take(2)?.try_into().ok()?;
            Some(usize::from(u16::from_be_bytes(bytes)))
        }

        fn u32(&mut self) -> Option<u32> {
            let bytes: [u8; 4] = self.take(4)?.try_into().ok()?;
            Some(u32::from_be_bytes(bytes))
        }

        fn text(&mut self, len: usize) -> Option<String> {
            String::from_utf8(self.take(len)?.to_vec()).ok()
        }

        fn atom_or_binary(&mut self) -> Option<Term> {
            match self.u8()? {
                BINARY => {
                    let len = usize::try_from(self.u32()?).ok()?;
                    self.text(len).map(Term::Text)
                }
                SMALL_ATOM_UTF8 | SMALL_ATOM => {
                    let len = usize::from(self.u8()?);
                    self.text(len).map(Term::Atom)
                }
                ATOM_UTF8 | ATOM => {
                    let len = self.u16()?;
                    self.text(len).map(Term::Atom)
                }
                SMALL_INTEGER => self.u8().map(|value| Term::Int(i64::from(value))),
                INTEGER => {
                    let raw = self.u32()?;
                    Some(Term::Int(i64::from(i32::from_be_bytes(raw.to_be_bytes()))))
                }
                _ => None,
            }
        }
    }

    enum Term {
        Text(String),
        Atom(String),
        Int(i64),
    }

    pub fn decode_session(bytes: &[u8]) -> Option<Session> {
        let mut reader = Reader { bytes };
        if reader.u8()? != VERSION || reader.u8()? != MAP {
            return None;
        }
        let arity = reader.u32()?;
        let mut session = Session::new();
        for _ in 0..arity {
            let key = match reader.atom_or_binary()? {
                Term::Text(key) | Term::Atom(key) => key,
                Term::Int(_) => return None,
            };
            let value = match reader.atom_or_binary()? {
                Term::Text(text) => SessionValue::Text(text),
                Term::Atom(atom) if atom == "true" => SessionValue::Bool(true),
                Term::Atom(atom) if atom == "false" => SessionValue::Bool(false),
                Term::Atom(atom) => SessionValue::Text(atom),
                Term::Int(value) => SessionValue::Int(value),
            };
            session.insert(key, value);
        }
        Some(session)
    }

    fn put_atom(out: &mut Vec<u8>, atom: &str) {
        out.push(SMALL_ATOM_UTF8);
        out.push(u8::try_from(atom.len()).unwrap_or(0));
        out.extend_from_slice(atom.as_bytes());
    }

    fn put_binary(out: &mut Vec<u8>, text: &str) {
        out.push(BINARY);
        out.extend_from_slice(&u32::try_from(text.len()).unwrap_or(0).to_be_bytes());
        out.extend_from_slice(text.as_bytes());
    }

    pub fn encode_session(session: &Session) -> Vec<u8> {
        let mut out = vec![VERSION, MAP];
        out.extend_from_slice(&u32::try_from(session.len()).unwrap_or(0).to_be_bytes());
        for (key, value) in session {
            put_binary(&mut out, key);
            match value {
                SessionValue::Text(text) => put_binary(&mut out, text),
                SessionValue::Bool(flag) => {
                    put_atom(&mut out, if *flag { "true" } else { "false" });
                }
                SessionValue::Int(value) => match i32::try_from(*value) {
                    Ok(small) => {
                        out.push(INTEGER);
                        out.extend_from_slice(&small.to_be_bytes());
                    }
                    Err(_) => put_binary(&mut out, &value.to_string()),
                },
            }
        }
        out
    }
}

/// `Plug.CSRFProtection` tokens. The session holds a 24-character token; pages
/// receive it masked with a fresh 24-character mask on every render.
pub mod csrf {
    use super::{URL_SAFE, URL_SAFE_NO_PAD, random_bytes, secure_compare};
    use base64::Engine;

    /// The session key holding the unmasked token.
    pub const SESSION_KEY: &str = "_csrf_token";

    /// A new unmasked session token (18 random bytes, URL-safe base64).
    #[must_use]
    pub fn generate() -> String {
        URL_SAFE.encode(random_bytes::<18>())
    }

    fn xor(left: &[u8], right: &[u8]) -> Vec<u8> {
        left.iter().zip(right).map(|(a, b)| a ^ b).collect()
    }

    /// Masks the session token for a page.
    #[must_use]
    pub fn mask(token: &str) -> String {
        let mask = generate();
        format!(
            "{}{mask}",
            URL_SAFE.encode(xor(token.as_bytes(), mask.as_bytes()))
        )
    }

    /// Whether a masked token from a request matches the session token.
    #[must_use]
    pub fn valid(session_token: &str, masked: &str) -> bool {
        if session_token.len() != 24 || masked.len() != 56 {
            return false;
        }
        let (Some(user), Some(mask)) = (masked.get(..32), masked.get(32..)) else {
            return false;
        };
        let decoded = URL_SAFE
            .decode(user)
            .or_else(|_| URL_SAFE_NO_PAD.decode(user.trim_end_matches('=')));
        match decoded {
            Ok(decoded) => {
                secure_compare(session_token.as_bytes(), &xor(&decoded, mask.as_bytes()))
            }
            Err(_) => false,
        }
    }
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
/// password signs every session out (`Auth.admin_password_fingerprint/0`).
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
        // Manavault.Encrypted.Binary.dump("hello") under the test secret_key_base.
        let stored = "enc.v1./vn7j1SNmfpWIcshuLeTbZaAcpaa1nxxNt9ecQmCnJDK";
        assert_eq!(decrypt_secret(SECRET, stored).as_deref(), Some("hello"));
    }

    #[test]
    fn sessions_round_trip() {
        let codec = SessionCodec::new(SECRET, "HGc1xdq0");
        let mut session = Session::new();
        session.insert("manavault_authenticated".into(), SessionValue::Bool(true));
        session.insert("_csrf_token".into(), SessionValue::Text(csrf::generate()));
        let cookie = codec.encode(&session);
        assert_eq!(codec.decode(&cookie), Some(session));
        assert_eq!(codec.decode(&format!("{cookie}x")), None);
    }

    #[test]
    fn decodes_a_session_cookie_signed_by_plug() {
        // Plug.Session.COOKIE.put for %{"_csrf_token" => "abc", "manavault_authenticated" => true}.
        let cookie = "SFMyNTY.g3QAAAACbQAAAAtfY3NyZl90b2tlbm0AAAADYWJjbQAAABdtYW5hdmF1bHRfYXV0aGVudGljYXRlZHcEdHJ1ZQ.ENCmpBNqdLvwNkJ2UAyY-jB_zuFmFeCu2vTu8VOtIb4";
        let codec = SessionCodec::new(SECRET, "HGc1xdq0");
        let session = codec.decode(cookie).unwrap();
        assert_eq!(
            session.get("_csrf_token"),
            Some(&SessionValue::Text("abc".into()))
        );
        assert_eq!(
            session.get("manavault_authenticated"),
            Some(&SessionValue::Bool(true))
        );
    }

    #[test]
    fn masked_csrf_tokens_validate() {
        let token = csrf::generate();
        assert_eq!(token.len(), 24);
        let masked = csrf::mask(&token);
        assert_eq!(masked.len(), 56);
        assert!(csrf::valid(&token, &masked));
        assert!(!csrf::valid(&csrf::generate(), &masked));
    }

    #[test]
    fn passwords_verify() {
        let hash = hash_password("hunter2");
        assert!(verify_password("hunter2", &hash));
        assert!(!verify_password("hunter3", &hash));
        // Manavault.Auth.hash_password("secret", iterations: 1, salt: "salt")
        assert!(verify_password(
            "secret",
            "pbkdf2_sha256$1$c2FsdA$ON9CizCTCOSMNofn-QvaDpzyU1aMIex1Sg4HarSrZCM"
        ));
    }
}
