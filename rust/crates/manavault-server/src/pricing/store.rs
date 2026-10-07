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
            sqlx::query!(
                r#"SELECT scryfall_id AS "scryfall_id!", finish AS "finish!", price_cents FROM vendor_prices WHERE vendor = ?1"#,
                source
            )
            .fetch_all(pool)
            .await?
            .into_iter()
            .map(|row| ((row.scryfall_id, row.finish), row.price_cents))
            .collect()
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
