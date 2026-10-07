//! The catalog card search (`Manavault.Catalog.Search.Cards`).

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use lotus::{OracleId, ScryfallId};
use sqlx::{QueryBuilder, Sqlite, SqlitePool};

use crate::catalog::card::{Card, CardRecord, NON_TOKEN_SQL, TOKEN_SQL};
use crate::catalog::printing::{self, Printing};
use crate::catalog::search::predicates;
use crate::catalog::sql::json_list;
use crate::{card_query, printing_query};

/// Whether a search covers tokens (`CardTokenScope`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, async_graphql::Enum)]
#[graphql(name = "CardTokenScope")]
pub enum TokenScope {
    /// Playable cards only.
    #[default]
    Exclude,
    /// Playable cards and tokens.
    Include,
    /// Tokens only.
    Only,
}

/// Sortable fields (`@sort_fields`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SortField {
    #[default]
    Name,
    ManaValue,
    Color,
    Type,
    Released,
    Rarity,
    Price,
}

/// A normalized sort: unknown fields sort by name, unknown directions ascend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Sort {
    pub field: SortField,
    pub descending: bool,
}

impl Sort {
    /// `normalize_sort/1` for the GraphQL `CardSort` input.
    #[must_use]
    pub fn parse(field: Option<&str>, direction: Option<&str>) -> Self {
        let field = match field.map(|f| f.trim().to_lowercase()).as_deref() {
            Some("mana_value") => SortField::ManaValue,
            Some("color") => SortField::Color,
            Some("type") => SortField::Type,
            Some("released") => SortField::Released,
            Some("rarity") => SortField::Rarity,
            Some("price") => SortField::Price,
            _ => SortField::Name,
        };
        let descending = direction.map(|d| d.trim().to_lowercase()).as_deref() == Some("desc");
        Self { field, descending }
    }

    fn order_by(self) -> String {
        const RARITY: &str = "CASE p.rarity WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 ELSE 0 END";
        const PRICE: &str =
            "COALESCE(CAST(p.prices->>'usd' AS REAL), CAST(p.prices->>'usd_foil' AS REAL))";
        let dir = if self.descending { "DESC" } else { "ASC" };
        let tiebreak = "c.name ASC, c.oracle_id ASC";
        match self.field {
            SortField::ManaValue => format!("c.cmc {dir}, {tiebreak}"),
            SortField::Color => format!(
                "json_array_length(c.color_identity) {dir}, c.color_identity ASC, {tiebreak}"
            ),
            SortField::Type => format!("c.type_line {dir}, {tiebreak}"),
            SortField::Released if self.descending => {
                format!("max(p.released_at) DESC, {tiebreak}")
            }
            SortField::Released => format!("min(p.released_at) ASC, {tiebreak}"),
            SortField::Rarity if self.descending => format!("max({RARITY}) DESC, {tiebreak}"),
            SortField::Rarity => format!("min({RARITY}) ASC, {tiebreak}"),
            SortField::Price if self.descending => format!("max({PRICE}) DESC, {tiebreak}"),
            SortField::Price => format!("min({PRICE}) ASC, {tiebreak}"),
            SortField::Name => format!("c.name {dir}, c.oracle_id ASC"),
        }
    }
}

/// Search options (`search_cards/2` opts).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SearchOptions {
    pub limit: i64,
    pub offset: i64,
    pub sort: Sort,
    pub tokens: TokenScope,
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            limit: 20,
            offset: 0,
            sort: Sort::default(),
            tokens: TokenScope::Exclude,
        }
    }
}

fn base_query(
    term_filter: Option<&crate::catalog::sql::Fragment>,
    select: &str,
) -> QueryBuilder<Sqlite> {
    let mut builder = QueryBuilder::new(format!(
        "SELECT {select} FROM scryfall_cards AS c LEFT JOIN scryfall_printings AS p ON p.oracle_id = c.oracle_id WHERE TRUE"
    ));
    if let Some(filter) = term_filter {
        builder.push(" AND ");
        filter.push_to(&mut builder);
    }
    builder
}

/// Cards matching `term`, each with its printings; printings that satisfy the
/// term come first, then the rest, each group earliest-released first.
///
/// Elixir bug: search results left `ownedCount` at 0 on every printing (the
/// preload never filled the virtual field), so the card search grid showed
/// no owned counts. The printings here carry real owned counts.
pub async fn search_cards(
    pool: &SqlitePool,
    term: &str,
    options: SearchOptions,
) -> Result<Vec<Card>, sqlx::Error> {
    let filter = predicates::card_filter(term);
    let mut builder = base_query(None, "c.oracle_id");
    builder.push(" AND ");
    builder.push(match options.tokens {
        TokenScope::Include => "TRUE",
        TokenScope::Only => TOKEN_SQL,
        TokenScope::Exclude => NON_TOKEN_SQL,
    });
    if let Some(filter) = &filter {
        builder.push(" AND ");
        filter.push_to(&mut builder);
    }
    builder.push(" GROUP BY c.oracle_id ORDER BY ");
    builder.push(options.sort.order_by());
    builder.push(" LIMIT ");
    builder.push_bind(options.limit);
    builder.push(" OFFSET ");
    builder.push_bind(options.offset);
    let card_ids: Vec<OracleId> = builder
        .build_query_scalar::<String>()
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(OracleId::from)
        .collect();
    if card_ids.is_empty() {
        return Ok(Vec::new());
    }

    let matched = matched_printing_ids(pool, filter.as_ref(), &card_ids).await?;
    let ids = json_list(&card_ids);
    let records: HashMap<OracleId, CardRecord> = card_query!(
        "WHERE c.oracle_id IN (SELECT value FROM json_each(?1))",
        ids
    )
    .fetch_all(pool)
    .await?
    .into_iter()
    .map(|record| (record.oracle_id.clone(), record))
    .collect();
    let printings = printing_query!(
        "WHERE p.oracle_id IN (SELECT value FROM json_each(?1))
         ORDER BY p.released_at ASC, p.scryfall_id ASC",
        ids
    )
    .fetch_all(pool)
    .await?;
    let owned = printing::owned_counts(pool, &card_ids).await?;
    let mut by_card: HashMap<OracleId, Vec<Printing>> = HashMap::new();
    for record in printings {
        let count = owned.get(&record.scryfall_id).copied().unwrap_or(0);
        by_card
            .entry(record.oracle_id.clone())
            .or_default()
            .push(Printing::from(record).with_owned_count(count));
    }

    Ok(card_ids
        .iter()
        .filter_map(|oracle_id| {
            let record = Arc::new(records.get(oracle_id)?.clone());
            let mut printings: Vec<Printing> = by_card
                .remove(oracle_id)
                .unwrap_or_default()
                .into_iter()
                .map(|printing| printing.with_card(record.clone()))
                .collect();
            // Stable: matched printings keep release order ahead of the rest.
            printings.sort_by_key(|printing| !matched.contains(&printing.record.scryfall_id));
            Some(Card {
                record,
                printings: Some(Arc::new(printings)),
            })
        })
        .collect())
}

/// Printings of the returned cards that satisfy the term.
async fn matched_printing_ids(
    pool: &SqlitePool,
    filter: Option<&crate::catalog::sql::Fragment>,
    card_ids: &[OracleId],
) -> Result<HashSet<ScryfallId>, sqlx::Error> {
    let mut builder = base_query(filter, "p.scryfall_id");
    builder.push(" AND c.oracle_id IN (SELECT value FROM json_each(");
    builder.push_bind(json_list(card_ids));
    builder.push("))");
    Ok(builder
        .build_query_scalar::<Option<String>>()
        .fetch_all(pool)
        .await?
        .into_iter()
        .flatten()
        .map(ScryfallId::from)
        .collect())
}
