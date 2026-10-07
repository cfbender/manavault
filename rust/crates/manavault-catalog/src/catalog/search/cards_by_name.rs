//! Exact card resolution by name (`Manavault.Catalog.Search.CardsByName`).
//!
//! Names are cleaned of decklist annotations, then matched case-,
//! diacritic-, and apostrophe-insensitively against `normalized_name` and
//! printing flavor names. Front faces of multi-faced cards and flavor names
//! resolve to the canonical card; exact canonical names win, otherwise the
//! alphabetically first card.

use std::collections::HashMap;

use lotus::OracleId;
use sqlx::SqlitePool;

use crate::card_query;
use crate::catalog::card::CardRecord;
use crate::catalog::search::name_match;
use crate::catalog::sql::json_list;

/// Removes a trailing `<whitespace><open><body><close><whitespace>*` suffix
/// whose body is non-empty and satisfies `body_ok`.
fn strip_suffix(name: &str, open: char, close: char, body_ok: impl Fn(char) -> bool) -> &str {
    let trimmed = name.trim_end();
    let Some(inner) = trimmed.strip_suffix(close) else {
        return name;
    };
    let Some(open_at) = inner.rfind(open) else {
        return name;
    };
    let body = inner.get(open_at + open.len_utf8()..).unwrap_or_default();
    if body.is_empty() || !body.chars().all(&body_ok) {
        return name;
    }
    let before = inner.get(..open_at).unwrap_or_default();
    let kept = before.trim_end();
    if kept.len() == before.len() {
        // `\s+` requires whitespace before the annotation.
        return name;
    }
    kept
}

/// Replaces each `\s+/\s+` run with ` // `.
fn normalize_face_separators(name: &str) -> String {
    let chars: Vec<char> = name.chars().collect();
    let mut out = String::with_capacity(name.len());
    let mut index = 0;
    while let Some(&c) = chars.get(index) {
        if c.is_whitespace() {
            let mut slash = index;
            while chars.get(slash).is_some_and(|c| c.is_whitespace()) {
                slash += 1;
            }
            let after = slash + 1;
            if chars.get(slash) == Some(&'/') && chars.get(after).is_some_and(|c| c.is_whitespace())
            {
                let mut end = after;
                while chars.get(end).is_some_and(|c| c.is_whitespace()) {
                    end += 1;
                }
                out.push_str(" // ");
                index = end;
                continue;
            }
            out.extend(chars.get(index..slash).unwrap_or_default());
            index = slash;
            continue;
        }
        out.push(c);
        index += 1;
    }
    out
}

/// Strips decklist annotations from a card name: a trailing `[Set]`, a
/// trailing `*F*`, and normalizes ` / ` to ` // `
/// (`Decklists.normalize_card_name/1`).
#[must_use]
pub fn normalize_card_name(name: &str) -> String {
    let name = name.trim();
    let name = strip_suffix(name, '[', ']', |c| c != ']');
    let name = strip_suffix(name, '*', '*', |c| c.is_ascii_uppercase());
    normalize_face_separators(name).trim().to_owned()
}

/// The lookup key for a name; also the key of [`by_names`] maps.
#[must_use]
pub fn key(name: &str) -> String {
    name_match::sql_normalize(&normalize_card_name(name))
}

/// The card whose normalized name matches `name`.
pub async fn find(pool: &SqlitePool, name: &str) -> Result<Option<CardRecord>, sqlx::Error> {
    let key = key(name);
    if key.is_empty() {
        return Ok(None);
    }
    Ok(by_names(pool, &[name]).await?.remove(&key))
}

fn front_face_key(normalized_name: &str) -> Option<&str> {
    normalized_name.split_once(" // ").map(|(front, _)| front)
}

/// Batched lookup: [`key`] → card for every name that resolves, including
/// front-face and flavor-name aliases.
pub async fn by_names<S: AsRef<str>>(
    pool: &SqlitePool,
    names: &[S],
) -> Result<HashMap<String, CardRecord>, sqlx::Error> {
    let mut keys: Vec<String> = names
        .iter()
        .map(|name| key(name.as_ref()))
        .filter(|key| !key.is_empty())
        .collect();
    keys.sort();
    keys.dedup();
    if keys.is_empty() {
        return Ok(HashMap::new());
    }
    let keys_json = json_list(&keys);
    let cards = card_query!(
        "WHERE (c.layout IS NULL OR c.layout NOT IN ('token', 'double_faced_token', 'emblem'))
           AND (c.normalized_name IN (SELECT value FROM json_each(?1))
             OR (instr(c.normalized_name, ' // ') > 0
                 AND substr(c.normalized_name, 1, instr(c.normalized_name, ' // ') - 1)
                     IN (SELECT value FROM json_each(?1))))
         ORDER BY c.name ASC",
        keys_json
    )
    .fetch_all(pool)
    .await?;

    let flavor_rows = sqlx::query!(
        r#"SELECT p.normalized_flavor_name AS "flavor!", c.oracle_id AS "oracle_id!: OracleId"
           FROM scryfall_printings AS p JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id
           WHERE p.normalized_flavor_name IN (SELECT value FROM json_each(?1))
             AND (c.layout IS NULL OR c.layout NOT IN ('token', 'double_faced_token', 'emblem'))
           ORDER BY c.name ASC"#,
        keys_json
    )
    .fetch_all(pool)
    .await?;
    let mut flavor_ids: Vec<OracleId> = flavor_rows
        .iter()
        .map(|row| row.oracle_id.clone())
        .collect();
    flavor_ids.sort();
    flavor_ids.dedup();
    let flavor_cards: HashMap<OracleId, CardRecord> =
        crate::catalog::card::load_records(pool, &flavor_ids)
            .await?
            .into_iter()
            .map(|card| (card.oracle_id.clone(), card))
            .collect();

    let mut matches: HashMap<String, CardRecord> = HashMap::new();
    for card in &cards {
        if let Some(normalized) = &card.normalized_name {
            matches
                .entry(normalized.clone())
                .or_insert_with(|| card.clone());
        }
    }
    for card in &cards {
        if let Some(front) = card.normalized_name.as_deref().and_then(front_face_key) {
            matches
                .entry(front.to_owned())
                .or_insert_with(|| card.clone());
        }
    }
    for row in flavor_rows {
        if let Some(card) = flavor_cards.get(&row.oracle_id) {
            matches.entry(row.flavor).or_insert_with(|| card.clone());
        }
    }
    Ok(matches)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_clean_annotations_and_normalize() {
        assert_eq!(key("Óin the Brave"), "oin the brave");
        assert_eq!(key("Oin the brave"), "oin the brave");
        assert_eq!(key("  Urza's Saga [Deck] "), "urzas saga");
        assert_eq!(key("Black Lotus *F*"), "black lotus");
        assert_eq!(key("Fire / Ice"), "fire // ice");
        assert_eq!(key("Fire // Ice"), "fire // ice");
        assert_eq!(key(""), "");
        assert_eq!(normalize_card_name("Sol Ring [C21] *F*"), "Sol Ring [C21]");
        assert_eq!(normalize_card_name("Sol Ring *F* [C21]"), "Sol Ring");
        assert_eq!(normalize_card_name("Sol Ring[C21]"), "Sol Ring[C21]");
        assert_eq!(normalize_card_name("Sol Ring *Foil*"), "Sol Ring *Foil*");
        assert_eq!(normalize_card_name("A  /  B / C"), "A // B // C");
    }
}
