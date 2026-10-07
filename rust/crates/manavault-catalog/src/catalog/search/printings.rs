//! Printing lookups (`Manavault.Catalog.Search.Printings`).

use lotus::ScryfallId;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::catalog::card::NON_TOKEN_SQL;
use crate::catalog::printing::{self, Printing, PrintingRecord, with_cards};
use crate::catalog::search::name_match;
use crate::catalog::sql::json_list;
use crate::printing_query;

/// Strips a scanner face suffix: gallery ids name printed faces
/// `<uuid>-<face>`, and only a suffix after a complete UUID is a face.
#[must_use]
pub fn strip_face_suffix(id: &str) -> &str {
    let is_hex_group =
        |text: &str, len: usize| text.len() == len && text.bytes().all(|b| b.is_ascii_hexdigit());
    let Some(uuid) = id.get(..36) else {
        return id;
    };
    let Some(rest) = id.get(36..) else {
        return id;
    };
    let groups: Vec<&str> = uuid.split('-').collect();
    let uuid_ok = matches!(
        groups.as_slice(),
        [first, second, third, fourth, fifth]
            if is_hex_group(first, 8) && is_hex_group(second, 4) && is_hex_group(third, 4)
                && is_hex_group(fourth, 4) && is_hex_group(fifth, 12)
    );
    let face_ok = rest
        .strip_prefix('-')
        .is_some_and(|digits| !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()));
    if uuid_ok && face_ok { uuid } else { id }
}

/// Every printing of a scanned card, ones with the scanned illustration (or
/// the scanned printing itself) first, then newest first, with owned counts
/// (`scanner_printings/2`). The scanned id may be unknown when the
/// illustration id resolves.
pub async fn scanner_printings(
    pool: &SqlitePool,
    scryfall_id: &str,
    illustration_id: Option<&str>,
) -> Result<Vec<Printing>, sqlx::Error> {
    let scryfall_id = strip_face_suffix(scryfall_id);
    let found = match printing_query!("WHERE p.scryfall_id = ?1", scryfall_id)
        .fetch_optional(pool)
        .await?
    {
        Some(found) => Some(found),
        None => match illustration_id {
            Some(illustration_id) => {
                printing_query!("WHERE p.illustration_id = ?1 LIMIT 1", illustration_id)
                    .fetch_optional(pool)
                    .await?
            }
            None => None,
        },
    };
    let Some(found) = found else {
        return Ok(Vec::new());
    };
    let target = illustration_id
        .map(str::to_owned)
        .or_else(|| found.illustration_id.clone());
    let records = printing_query!(
        "WHERE p.oracle_id = ?1
         ORDER BY CASE WHEN p.illustration_id = ?2 OR p.scryfall_id = ?3 THEN 0 ELSE 1 END ASC,
                  p.released_at DESC, p.set_code ASC, p.collector_number ASC
         LIMIT 300",
        found.oracle_id,
        target,
        found.scryfall_id
    )
    .fetch_all(pool)
    .await?;
    let owned = printing::owned_counts(pool, std::slice::from_ref(&found.oracle_id)).await?;
    Ok(with_cards(pool, records)
        .await?
        .into_iter()
        .map(|printing| {
            let count = owned
                .get(&printing.record.scryfall_id)
                .copied()
                .unwrap_or(0);
            printing.with_owned_count(count)
        })
        .collect())
}

/// Distinct illustration ids printed in any of the given sets
/// (`set_illustration_ids/1`, the scanner's set lock).
pub async fn set_illustration_ids(
    pool: &SqlitePool,
    set_codes: &[String],
) -> Result<Vec<String>, sqlx::Error> {
    if set_codes.is_empty() {
        return Ok(Vec::new());
    }
    let codes: Vec<String> = set_codes.iter().map(|code| code.to_lowercase()).collect();
    let codes = json_list(&codes);
    sqlx::query_scalar!(
        r#"SELECT DISTINCT p.illustration_id AS "illustration_id!"
           FROM scryfall_printings AS p
           WHERE p.set_code IN (SELECT value FROM json_each(?1)) AND p.illustration_id IS NOT NULL"#,
        codes
    )
    .fetch_all(pool)
    .await
}

/// A set matching a search (`:set_suggestion`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, async_graphql::SimpleObject)]
pub struct SetSuggestion {
    pub set_code: String,
    pub set_name: Option<String>,
}

/// Sets whose code or name contains the term (`search_sets/2`). The term is
/// not LIKE-escaped, as in earlier releases.
pub async fn search_sets(
    pool: &SqlitePool,
    term: &str,
    limit: i64,
) -> Result<Vec<SetSuggestion>, sqlx::Error> {
    let query = term.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let pattern = format!("%{}%", query.to_lowercase());
    sqlx::query_as!(
        SetSuggestion,
        r#"SELECT p.set_code AS "set_code!", p.set_name AS "set_name?"
           FROM scryfall_printings AS p
           WHERE lower(p.set_code) LIKE ?1 OR lower(coalesce(p.set_name, '')) LIKE ?1
           GROUP BY p.set_code, p.set_name
           ORDER BY p.set_name ASC, p.set_code ASC
           LIMIT ?2"#,
        pattern,
        limit
    )
    .fetch_all(pool)
    .await
}

/// The printing at a set and collector number (`get_printing/2`).
pub async fn get_printing(
    pool: &SqlitePool,
    set_code: &str,
    collector_number: &str,
) -> Result<Option<PrintingRecord>, sqlx::Error> {
    let set_code = set_code.to_lowercase();
    printing_query!(
        "WHERE p.set_code = ?1 AND p.collector_number = ?2 LIMIT 1",
        set_code,
        collector_number
    )
    .fetch_optional(pool)
    .await
}

/// Every printing of a card with its card, newest first
/// (`list_printings_for_oracle_id/1`).
pub async fn list_printings_for_oracle_id(
    pool: &SqlitePool,
    oracle_id: &lotus::OracleId,
) -> Result<Vec<Printing>, sqlx::Error> {
    let records = printing_query!(
        "WHERE p.oracle_id = ?1 ORDER BY p.released_at DESC, p.set_code ASC, p.collector_number ASC",
        oracle_id
    )
    .fetch_all(pool)
    .await?;
    with_cards(pool, records).await
}

/// Filters for [`search_printings`].
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PrintingFilters {
    pub name: String,
    pub set_code: String,
    pub collector_number: String,
}

/// Playable printings by name, set, and collector number, by card name then
/// set and number (`search_printings/2`). Empty when no filter is given.
pub async fn search_printings(
    pool: &SqlitePool,
    filters: &PrintingFilters,
    limit: i64,
) -> Result<Vec<Printing>, sqlx::Error> {
    let name = filters.name.trim();
    let set_code = filters.set_code.trim().to_lowercase();
    let collector_number = filters.collector_number.trim();
    if name.is_empty() && set_code.is_empty() && collector_number.is_empty() {
        return Ok(Vec::new());
    }
    let mut builder = sqlx::QueryBuilder::new(format!(
        "SELECT p.scryfall_id FROM scryfall_printings AS p JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id WHERE {NON_TOKEN_SQL}"
    ));
    if !name.is_empty() {
        let pattern = name_match::like_pattern(name);
        builder.push(" AND (c.normalized_name LIKE ");
        builder.push_bind(pattern.clone());
        builder.push(" ESCAPE '\\' OR p.normalized_flavor_name LIKE ");
        builder.push_bind(pattern);
        builder.push(" ESCAPE '\\')");
    }
    if !set_code.is_empty() {
        builder.push(" AND p.set_code = ");
        builder.push_bind(set_code);
    }
    if !collector_number.is_empty() {
        builder.push(" AND p.collector_number = ");
        builder.push_bind(collector_number.to_owned());
    }
    builder.push(" ORDER BY c.name ASC, p.set_code ASC, p.collector_number ASC LIMIT ");
    builder.push_bind(limit);
    let ids: Vec<ScryfallId> = builder
        .build_query_scalar::<String>()
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(ScryfallId::from)
        .collect();
    let mut by_id = Printing::load_many(pool, &ids).await?;
    Ok(ids.iter().filter_map(|id| by_id.remove(id)).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_only_face_suffixes_after_a_uuid() {
        let uuid = "0a1b2c3d-0000-4000-8000-123456789012";
        assert_eq!(strip_face_suffix(uuid), uuid);
        assert_eq!(strip_face_suffix(&format!("{uuid}-1")), uuid);
        assert_eq!(strip_face_suffix(&format!("{uuid}-x")), format!("{uuid}-x"));
        assert_eq!(strip_face_suffix("scan-base-1"), "scan-base-1");
    }
}
