//! Which tokens are printed on the back of which, from
//! `priv/data/token_backs.json` (`Manavault.Catalog.Tokens.KnownBacks`).
//!
//! Scryfall lists most double-sided precon tokens as separate single-faced
//! printings, so the pairings come from Wizards' card image galleries. Pairs
//! are undirected and keyed by `"<set_code>/<collector number>"`.

use std::collections::HashMap;
use std::sync::LazyLock;

use serde::Deserialize;

const DATA: &str = include_str!("../../../../../priv/data/token_backs.json");

/// One stored pairing.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Pair {
    pub front: String,
    pub back: String,
}

#[derive(Debug, Deserialize)]
struct File {
    pairs: Vec<Pair>,
}

static PAIRS: LazyLock<Vec<Pair>> = LazyLock::new(|| {
    serde_json::from_str::<File>(DATA).map_or_else(
        |error| {
            tracing::error!(%error, "priv/data/token_backs.json is unreadable");
            Vec::new()
        },
        |file| file.pairs,
    )
});

static BACKS_BY_FACE: LazyLock<HashMap<String, Vec<String>>> = LazyLock::new(|| {
    let mut backs: HashMap<String, Vec<String>> = HashMap::new();
    for pair in PAIRS.iter() {
        backs
            .entry(pair.front.clone())
            .or_default()
            .push(pair.back.clone());
        backs
            .entry(pair.back.clone())
            .or_default()
            .push(pair.front.clone());
    }
    backs
});

/// Every known pairing, as stored.
#[must_use]
pub fn pairs() -> &'static [Pair] {
    &PAIRS
}

/// `(set_code, collector_number)` of each token known to be printed on the
/// back of the given face, in data-file order.
#[must_use]
pub fn back_keys(set_code: &str, collector_number: &str) -> Vec<(String, String)> {
    BACKS_BY_FACE
        .get(&format!("{set_code}/{collector_number}"))
        .into_iter()
        .flatten()
        .filter_map(|key| {
            let (set, number) = key.split_once('/')?;
            Some((set.to_owned(), number.to_owned()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn face_key_ok(key: &str) -> bool {
        let Some((set, number)) = key.split_once('/') else {
            return false;
        };
        let set_ok = (3..=6).contains(&set.len())
            && set
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit());
        let digits = number.trim_end_matches(|c: char| c.is_ascii_lowercase() || c == '★');
        let suffix = number.len() - digits.len();
        set_ok
            && !digits.is_empty()
            && digits.bytes().all(|b| b.is_ascii_digit())
            && number.chars().count() - digits.chars().count() <= 1
            && suffix <= '★'.len_utf8()
    }

    #[test]
    fn data_file_holds_well_formed_distinct_pairs() {
        let pairs = pairs();
        assert_ne!(pairs.len(), 0);
        let mut keys = Vec::new();
        for pair in pairs {
            assert!(face_key_ok(&pair.front), "bad face key {}", pair.front);
            assert!(face_key_ok(&pair.back), "bad face key {}", pair.back);
            assert_ne!(pair.front, pair.back);
            let mut key = vec![pair.front.clone(), pair.back.clone()];
            key.sort();
            keys.push(key);
        }
        let total = keys.len();
        keys.sort();
        keys.dedup();
        assert_eq!(keys.len(), total, "duplicate pairs in token_backs.json");
    }

    #[test]
    fn back_keys_read_a_pairing_from_either_side() {
        let pair = |set: &str, number: &str| (set.to_owned(), number.to_owned());
        assert_eq!(
            back_keys("tm3c", "12"),
            vec![pair("tm3c", "8"), pair("tmh3", "1"), pair("tmh3", "34")]
        );
        assert!(back_keys("tmh3", "1").contains(&pair("tm3c", "12")));
        assert!(back_keys("tmh3", "34").contains(&pair("tm3c", "12")));
        assert_eq!(back_keys("tlea", "1"), vec![]);
        assert_eq!(back_keys("tm3c", "9999"), vec![]);
    }
}
