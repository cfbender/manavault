//! Card prices from Scryfall or a vendor source (`Manavault.Pricing`).
//!
//! Vendor prices live in their own `vendor_prices` table, written only by
//! vendor syncs. Scryfall catalog imports keep writing
//! `scryfall_printings.prices`; neither overwrites the other. Reads go
//! through [`PriceStore::price_cents`], which resolves against the active
//! source and returns `None` when the source is Scryfall or has no price, so
//! callers can fall back to the Scryfall data.

pub mod graphql;
pub mod sync;
pub mod vendors;
pub mod worker;

pub use manavault_core::pricing::{PriceStore, money, store};
pub use vendors::Vendor;

use sqlx::SqlitePool;
use time::OffsetDateTime;

use manavault_core::state::AppState;
use manavault_core::timestamp::Timestamp;

/// The selectable price sources (`Pricing.Settings.sources/0`).
pub const SOURCES: [&str; 4] = ["scryfall", "tcgplayer", "cardkingdom", "manapool"];

/// Where card prices come from.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PriceSource {
    Scryfall,
    Vendor(Vendor),
}

impl PriceSource {
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            store::SCRYFALL_SOURCE => Some(Self::Scryfall),
            other => Vendor::parse(other).map(Self::Vendor),
        }
    }

    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Scryfall => store::SCRYFALL_SOURCE,
            Self::Vendor(vendor) => vendor.as_str(),
        }
    }
}

/// The active price source, creating the settings row on first use.
pub async fn source(pool: &SqlitePool) -> Result<String, sqlx::Error> {
    if let Some(source) = sqlx::query_scalar!("SELECT source FROM pricing_settings WHERE id = 1")
        .fetch_optional(pool)
        .await?
    {
        return Ok(source);
    }
    let now = Timestamp::now();
    sqlx::query!(
        "INSERT INTO pricing_settings (id, source, inserted_at, updated_at) VALUES (1, 'scryfall', ?1, ?1) ON CONFLICT DO NOTHING",
        now
    )
    .execute(pool)
    .await?;
    sqlx::query_scalar!("SELECT source FROM pricing_settings WHERE id = 1")
        .fetch_one(pool)
        .await
}

#[derive(Debug, thiserror::Error)]
pub enum SetSourceError {
    /// The changeset error text (`"source is invalid"`).
    #[error("{0}")]
    Invalid(String),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Changes the price source, then reloads the price store and drops cached
/// collection values.
pub async fn set_source(state: &AppState, source: &str) -> Result<PriceSource, SetSourceError> {
    // A blank source counts as missing.
    if source.trim().is_empty() {
        return Err(SetSourceError::Invalid("source can't be blank".to_owned()));
    }
    let parsed = PriceSource::parse(source)
        .ok_or_else(|| SetSourceError::Invalid("source is invalid".to_owned()))?;
    self::source(&state.db).await?;
    let now = Timestamp::now();
    let value = parsed.as_str();
    sqlx::query!(
        "UPDATE pricing_settings SET source = ?1, updated_at = ?2 WHERE id = 1",
        value,
        now
    )
    .execute(&state.db)
    .await?;
    state.prices.refresh(&state.db).await?;
    crate::catalog::invalidate_after_import(state).await;
    Ok(parsed)
}

/// One vendor's price count and last sync.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VendorStatus {
    pub vendor: Vendor,
    pub price_count: i64,
    /// `updated_at` of the vendor's newest price row.
    pub last_synced_at: Option<OffsetDateTime>,
}

/// When the vendor's prices were last written.
pub async fn last_synced_at(
    pool: &SqlitePool,
    vendor: Vendor,
) -> Result<Option<OffsetDateTime>, sqlx::Error> {
    let vendor = vendor.as_str();
    sqlx::query_scalar!(
        r#"SELECT updated_at AS "updated_at: OffsetDateTime" FROM vendor_prices
           WHERE vendor = ?1 ORDER BY updated_at DESC LIMIT 1"#,
        vendor
    )
    .fetch_optional(pool)
    .await
}

/// Every vendor's status, in [`Vendor::ALL`] order.
pub async fn vendor_statuses(pool: &SqlitePool) -> Result<Vec<VendorStatus>, sqlx::Error> {
    let counts = sqlx::query!(
        r#"SELECT vendor AS "vendor!", count(scryfall_id) AS "count!: i64" FROM vendor_prices GROUP BY vendor"#
    )
    .fetch_all(pool)
    .await?;
    let mut statuses = Vec::new();
    for vendor in Vendor::ALL {
        statuses.push(VendorStatus {
            vendor,
            price_count: counts
                .iter()
                .find(|row| row.vendor == vendor.as_str())
                .map_or(0, |row| row.count),
            last_synced_at: last_synced_at(pool, vendor).await?,
        });
    }
    Ok(statuses)
}

#[cfg(test)]
mod tests;
