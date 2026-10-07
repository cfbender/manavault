//! Public deck share tokens (`Decks.ShareToken`): 18 random bytes as
//! unpadded URL-safe base64.

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;

const BYTE_SIZE: usize = 18;
const ENCODED_SIZE: usize = 24;

/// A new random token.
#[must_use]
pub fn generate() -> String {
    URL_SAFE_NO_PAD.encode(manavault_core::crypto::random_bytes::<BYTE_SIZE>())
}

/// Whether `token` has the generated shape, so malformed tokens never reach
/// the database.
#[must_use]
pub fn is_valid(token: &str) -> bool {
    token.len() == ENCODED_SIZE
        && token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
        && URL_SAFE_NO_PAD
            .decode(token)
            .is_ok_and(|decoded| decoded.len() == BYTE_SIZE)
}

#[cfg(test)]
mod tests {
    use super::*;

    // The share token contract.
    #[test]
    fn tokens_are_url_safe_unpadded_18_bytes() {
        let token = generate();
        assert_eq!(token.len(), 24);
        assert!(is_valid(&token));
        assert_eq!(URL_SAFE_NO_PAD.decode(&token).unwrap().len(), 18);
        assert!(!is_valid(&format!("{token}=")));
        assert!(!is_valid(&"A".repeat(23)));
        assert!(!is_valid(&"/".repeat(24)));
        assert!(!is_valid(""));
        assert!(!is_valid(&"=".repeat(24)));
        assert!(is_valid(&"A".repeat(24)));
    }
}
