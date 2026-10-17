//! Sets: the catalog's printings grouped by set code, for the set browser.
//!
//! The catalog side of the set list (names, release dates, card counts, and
//! each set's most valuable cards) is cached per catalog generation; owned
//! counts are read fresh.

use std::collections::HashMap;
use std::time::Duration;

use async_graphql::{Context, Object};
use lotus::ScryfallId;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;

use crate::catalog::printing::{self, Printing};
use crate::catalog::schema::CardSort;
use crate::catalog::search::predicates;
use crate::catalog::{cache, json};
use manavault_core::state::AppState;

const SUMMARIES_KEY: &str = "sets:summaries";
const SUMMARIES_TTL: Duration = Duration::from_secs(24 * 60 * 60);
/// How many of a set's most valuable cards its summary carries.
const PREVIEW_COUNT: i64 = 3;
const PRICE_SQL: &str =
    "COALESCE(CAST(p.prices->>'usd' AS REAL), CAST(p.prices->>'usd_foil' AS REAL), 0)";
const RARITY_SQL: &str = "CASE p.rarity WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 ELSE 0 END";

/// The catalog facts about one set.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SetSummary {
    pub code: String,
    pub name: Option<String>,
    /// `YYYY-MM-DD`: the set's earliest printing.
    pub released_at: Option<String>,
    pub card_count: i64,
    /// Front images of the set's most valuable printings, priciest first.
    pub preview_image_urls: Vec<String>,
}

/// A set as a GraphQL object (`CardSet`).
#[derive(Debug, Clone)]
pub struct CardSet {
    pub summary: SetSummary,
    /// Distinct printings of the set in the collection.
    pub owned_count: i64,
}

async fn load_summaries(pool: &SqlitePool) -> Result<Vec<SetSummary>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT p.set_code AS "code!", max(p.set_name) AS "name?: String",
                  min(p.released_at) AS "released_at?: String", count(*) AS "card_count!: i64"
           FROM scryfall_printings AS p
           GROUP BY p.set_code
           ORDER BY min(p.released_at) DESC, p.set_code ASC"#
    )
    .fetch_all(pool)
    .await?;
    // Priciest first, as PRICE_SQL and RARITY_SQL order them.
    let previews = sqlx::query!(
        r#"SELECT set_code AS "set_code!", image_uris AS "image_uris!" FROM (
             SELECT p.set_code, p.image_uris,
                    ROW_NUMBER() OVER (
                      PARTITION BY p.set_code
                      ORDER BY COALESCE(CAST(p.prices->>'usd' AS REAL), CAST(p.prices->>'usd_foil' AS REAL), 0) DESC,
                               CASE p.rarity WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 ELSE 0 END DESC,
                               p.collector_number ASC
                    ) AS position
             FROM scryfall_printings AS p)
           WHERE position <= ?1 ORDER BY set_code, position"#,
        PREVIEW_COUNT
    )
    .fetch_all(pool)
    .await?;
    let mut images: HashMap<String, Vec<String>> = HashMap::new();
    for row in previews {
        if let Some(url) = printing::image_url(&json::value_or(&row.image_uris, Value::Null)) {
            images.entry(row.set_code).or_default().push(url);
        }
    }
    Ok(rows
        .into_iter()
        .map(|row| SetSummary {
            preview_image_urls: images.remove(&row.code).unwrap_or_default(),
            code: row.code,
            name: row.name,
            released_at: row.released_at,
            card_count: row.card_count,
        })
        .collect())
}

/// Distinct owned printings per set, ignoring list locations (as printing
/// owned counts do).
async fn owned_counts(
    pool: &SqlitePool,
    code: Option<&str>,
) -> Result<HashMap<String, i64>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT p.set_code AS "code!", count(DISTINCT item.scryfall_id) AS "owned!: i64"
           FROM collection_items AS item
           JOIN scryfall_printings AS p ON p.scryfall_id = item.scryfall_id
           LEFT JOIN locations AS location ON location.id = item.location_id
           WHERE (location.id IS NULL OR location.kind != 'list') AND (?1 IS NULL OR p.set_code = ?1)
           GROUP BY p.set_code"#,
        code
    )
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().map(|row| (row.code, row.owned)).collect())
}

/// The catalog facts about every set, newest first.
async fn summaries(state: &AppState) -> Result<Vec<SetSummary>, sqlx::Error> {
    if let Some(summaries) = cache::get::<Vec<SetSummary>>(state, SUMMARIES_KEY).await {
        return Ok(summaries);
    }
    let summaries = load_summaries(&state.db).await?;
    cache::put(state, SUMMARIES_KEY, &summaries, SUMMARIES_TTL).await;
    Ok(summaries)
}

/// Every set in the catalog, newest first.
pub async fn list(state: &AppState) -> Result<Vec<CardSet>, sqlx::Error> {
    let mut owned = owned_counts(&state.db, None).await?;
    Ok(summaries(state)
        .await?
        .into_iter()
        .map(|summary| CardSet {
            owned_count: owned.remove(&summary.code).unwrap_or(0),
            summary,
        })
        .collect())
}

/// One set by code, in any case.
pub async fn find(state: &AppState, code: &str) -> Result<Option<CardSet>, sqlx::Error> {
    let code = code.trim().to_lowercase();
    let Some(summary) = summaries(state)
        .await?
        .into_iter()
        .find(|summary| summary.code == code)
    else {
        return Ok(None);
    };
    let owned_count = owned_counts(&state.db, Some(&code))
        .await?
        .remove(&code)
        .unwrap_or(0);
    Ok(Some(CardSet {
        summary,
        owned_count,
    }))
}

/// The `ORDER BY` for a set's printings. Collector number (set order) is the
/// default and the tiebreak; numbers sort numerically, then by suffix.
fn order_by(sort: &CardSort) -> String {
    let dir = if sort.direction.as_deref().map(str::trim) == Some("desc") {
        "DESC"
    } else {
        "ASC"
    };
    let number = "CAST(p.collector_number AS INTEGER) ASC, p.collector_number ASC";
    let field = match sort.field.as_deref().map_or("number", str::trim) {
        "name" => format!("c.name {dir}"),
        "mana_value" => format!("c.cmc {dir}"),
        "color" => format!("json_array_length(c.color_identity) {dir}, c.color_identity {dir}"),
        "type" => format!("c.type_line {dir}"),
        "rarity" => format!("{RARITY_SQL} {dir}"),
        "price" => format!("{PRICE_SQL} {dir}"),
        _ => {
            return format!("CAST(p.collector_number AS INTEGER) {dir}, p.collector_number {dir}");
        }
    };
    format!("{field}, {number}")
}

/// A set's printings matching `term` (catalog search syntax), in `sort`
/// order, with their cards and owned counts.
pub async fn printings(
    pool: &SqlitePool,
    code: &str,
    term: &str,
    sort: &CardSort,
) -> Result<Vec<Printing>, sqlx::Error> {
    let mut builder = sqlx::QueryBuilder::new(
        "SELECT p.scryfall_id FROM scryfall_printings AS p JOIN scryfall_cards AS c ON c.oracle_id = p.oracle_id WHERE p.set_code = ",
    );
    builder.push_bind(code.to_lowercase());
    if let Some(filter) = predicates::card_filter(term) {
        builder.push(" AND ");
        filter.push_to(&mut builder);
    }
    builder.push(" ORDER BY ");
    builder.push(order_by(sort));
    let ids: Vec<ScryfallId> = builder
        .build_query_scalar::<String>()
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(ScryfallId::from)
        .collect();
    let mut by_id = Printing::load_many(pool, &ids).await?;
    let oracle_ids: Vec<lotus::OracleId> = by_id
        .values()
        .map(|printing| printing.record.oracle_id.clone())
        .collect();
    let owned = printing::owned_counts(pool, &oracle_ids).await?;
    Ok(ids
        .iter()
        .filter_map(|id| {
            let printing = by_id.remove(id)?;
            let count = owned.get(id).copied().unwrap_or(0);
            Some(printing.with_owned_count(count))
        })
        .collect())
}

#[Object]
impl CardSet {
    /// The lowercase set code.
    async fn code(&self) -> &str {
        &self.summary.code
    }

    async fn name(&self) -> String {
        self.summary
            .name
            .clone()
            .unwrap_or_else(|| self.summary.code.to_uppercase())
    }

    /// `YYYY-MM-DD`: the set's earliest printing.
    async fn released_at(&self) -> Option<&str> {
        self.summary.released_at.as_deref()
    }

    /// Scryfall's set type (`expansion`, `core`, `commander`, ...), when the
    /// set icons have been synced.
    async fn set_type(&self, ctx: &Context<'_>) -> Option<String> {
        crate::scryfall_assets::set(
            &manavault_core::graphql::state(ctx)
                .config
                .scryfall_assets_dir,
            &self.summary.code,
        )?
        .get("set_type")?
        .as_str()
        .map(str::to_owned)
    }

    async fn icon_url(&self, ctx: &Context<'_>) -> String {
        crate::scryfall_assets::set_icon_url(
            &manavault_core::graphql::state(ctx)
                .config
                .scryfall_assets_dir,
            &self.summary.code,
        )
    }

    /// Printings of the set in the catalog.
    async fn card_count(&self) -> i64 {
        self.summary.card_count
    }

    /// Distinct printings of the set in the collection.
    async fn owned_count(&self) -> i64 {
        self.owned_count
    }

    /// Front images of the set's most valuable printings, priciest first.
    async fn preview_image_urls(&self) -> &[String] {
        &self.summary.preview_image_urls
    }

    /// The set's printings matching `q` (catalog search syntax), in collector
    /// number order unless `sort` names a field (`number`, `name`,
    /// `mana_value`, `color`, `type`, `rarity`, or `price`).
    async fn printings(
        &self,
        ctx: &Context<'_>,
        q: Option<String>,
        sort: Option<CardSort>,
    ) -> manavault_core::graphql::Result<Vec<Printing>> {
        printings(
            &manavault_core::graphql::state(ctx).db,
            &self.summary.code,
            q.as_deref().unwrap_or(""),
            &sort.unwrap_or_default(),
        )
        .await
        .map_err(crate::catalog::schema::db_error)
    }
}
