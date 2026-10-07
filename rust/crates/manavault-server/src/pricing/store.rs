//! In-memory vendor prices for the active price source
//! (`Manavault.Pricing.Store`).
//!
//! Derived state: rebuilt from `vendor_prices` at boot, after every vendor
//! sync, and whenever the price source changes. Lookups are synchronous so
//! price formatting in resolvers never waits on the database.

use std::collections::HashMap;
use std::sync::RwLock;

use sqlx::SqlitePool;

/// The price source that uses Scryfall's own prices (no vendor lookups).
pub const SCRYFALL_SOURCE: &str = "scryfall";

#[derive(Debug, Default)]
struct Loaded {
    source: Option<String>,
    prices: HashMap<(String, String), i64>,
}

/// Rows read per query while loading a vendor's prices. A vendor has about
/// 150k prices; one query for all of them takes over a second and trips
/// sqlx's slow-statement warning, which should stay meaningful for request
/// queries. Pages walk the `(vendor, scryfall_id, finish)` primary key.
const LOAD_PAGE: i64 = 20_000;

async fn load_vendor(
    pool: &SqlitePool,
    vendor: &str,
) -> Result<HashMap<(String, String), i64>, sqlx::Error> {
    let mut prices = HashMap::new();
    let (mut after_id, mut after_finish) = (String::new(), String::new());
    loop {
        let rows = sqlx::query!(
            r#"SELECT scryfall_id AS "scryfall_id!", finish AS "finish!", price_cents
               FROM vendor_prices
               WHERE vendor = ?1 AND (scryfall_id, finish) > (?2, ?3)
               ORDER BY scryfall_id, finish
               LIMIT ?4"#,
            vendor,
            after_id,
            after_finish,
            LOAD_PAGE
        )
        .fetch_all(pool)
        .await?;
        let full = i64::try_from(rows.len()).is_ok_and(|len| len == LOAD_PAGE);
        if let Some(last) = rows.last() {
            after_id.clone_from(&last.scryfall_id);
            after_finish.clone_from(&last.finish);
        }
        prices.extend(
            rows.into_iter()
                .map(|row| ((row.scryfall_id, row.finish), row.price_cents)),
        );
        if !full {
            return Ok(prices);
        }
    }
}

/// Vendor prices keyed by `(scryfall_id, finish)`.
#[derive(Debug, Default)]
pub struct PriceStore {
    inner: RwLock<Loaded>,
}

impl PriceStore {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    /// The active source, or `None` before the first load.
    #[must_use]
    pub fn active_source(&self) -> Option<String> {
        self.inner
            .read()
            .ok()
            .and_then(|loaded| loaded.source.clone())
    }

    /// Price in cents for the first finish in `finish_chain` that the active
    /// vendor source prices, or `None` when the source is Scryfall or nothing
    /// matches.
    #[must_use]
    pub fn price_cents(&self, scryfall_id: &str, finish_chain: &[&str]) -> Option<i64> {
        let loaded = self.inner.read().ok()?;
        match loaded.source.as_deref() {
            None | Some(SCRYFALL_SOURCE) => None,
            Some(_) => finish_chain.iter().find_map(|finish| {
                loaded
                    .prices
                    .get(&(scryfall_id.to_owned(), (*finish).to_owned()))
                    .copied()
            }),
        }
    }

    /// How many vendor prices are loaded.
    #[must_use]
    pub fn len(&self) -> usize {
        self.inner.read().map_or(0, |loaded| loaded.prices.len())
    }

    /// Whether no vendor prices are loaded.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Rebuilds the store from `pricing_settings` and `vendor_prices`.
    pub async fn refresh(&self, pool: &SqlitePool) -> Result<(), sqlx::Error> {
        let source: String =
            sqlx::query_scalar!("SELECT source FROM pricing_settings WHERE id = 1")
                .fetch_optional(pool)
                .await?
                .unwrap_or_else(|| SCRYFALL_SOURCE.to_owned());
        let prices = if source == SCRYFALL_SOURCE {
            HashMap::new()
        } else {
            load_vendor(pool, &source).await?
        };
        tracing::debug!(source, prices = prices.len(), "pricing store loaded");
        if let Ok(mut loaded) = self.inner.write() {
            *loaded = Loaded {
                source: Some(source),
                prices,
            };
        }
        Ok(())
    }
}
