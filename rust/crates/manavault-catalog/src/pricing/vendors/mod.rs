//! Vendor price feeds (`Manavault.Pricing.Vendors.*`).

pub mod card_kingdom;
pub mod mana_pool;
pub mod tcg_csv;

use std::time::Duration;

use async_trait::async_trait;

use manavault_core::state::AppState;

/// A vendor with a price feed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Vendor {
    TcgPlayer,
    CardKingdom,
    ManaPool,
}

impl Vendor {
    /// Every vendor, in display and sync order (`Pricing.vendors/0`).
    pub const ALL: [Vendor; 3] = [Vendor::TcgPlayer, Vendor::CardKingdom, Vendor::ManaPool];

    /// The `vendor_prices.vendor` and price-source value.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::TcgPlayer => "tcgplayer",
            Self::CardKingdom => "cardkingdom",
            Self::ManaPool => "manapool",
        }
    }

    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL
            .into_iter()
            .find(|vendor| vendor.as_str() == value)
    }

    /// How often the periodic job refreshes the vendor's prices.
    #[must_use]
    pub fn sync_interval(self) -> Duration {
        match self {
            Self::TcgPlayer => Duration::from_secs(24 * 3600),
            Self::CardKingdom | Self::ManaPool => Duration::from_secs(6 * 3600),
        }
    }
}

impl std::fmt::Display for Vendor {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// One price: a printing's finish at a vendor, in cents.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct VendorRow {
    pub scryfall_id: String,
    pub finish: lotus::Finish,
    pub price_cents: i64,
}

impl VendorRow {
    #[must_use]
    pub fn new(scryfall_id: &str, finish: lotus::Finish, price_cents: i64) -> Self {
        Self {
            scryfall_id: scryfall_id.to_owned(),
            finish,
            price_cents,
        }
    }
}

/// A source of one vendor's prices.
#[async_trait]
pub trait VendorFeed: Send + Sync {
    fn vendor(&self) -> Vendor;
    async fn fetch(&self, state: &AppState) -> Result<Vec<VendorRow>, String>;
}

/// The feed endpoints, overridable for tests.
#[derive(Debug, Clone)]
pub struct FeedUrls {
    pub tcg_csv_base_url: String,
    pub tcg_csv_request_delay: Duration,
    pub card_kingdom_url: String,
    pub mana_pool_url: String,
}

impl Default for FeedUrls {
    fn default() -> Self {
        Self {
            tcg_csv_base_url: tcg_csv::BASE_URL.to_owned(),
            tcg_csv_request_delay: tcg_csv::REQUEST_DELAY,
            card_kingdom_url: card_kingdom::PRICELIST_URL.to_owned(),
            mana_pool_url: mana_pool::PRICES_URL.to_owned(),
        }
    }
}

/// The feed for a vendor.
#[must_use]
pub fn feed(vendor: Vendor, urls: &FeedUrls) -> std::sync::Arc<dyn VendorFeed> {
    match vendor {
        Vendor::TcgPlayer => std::sync::Arc::new(tcg_csv::TcgCsv {
            base_url: urls.tcg_csv_base_url.clone(),
            request_delay: urls.tcg_csv_request_delay,
        }),
        Vendor::CardKingdom => std::sync::Arc::new(card_kingdom::CardKingdom {
            url: urls.card_kingdom_url.clone(),
        }),
        Vendor::ManaPool => std::sync::Arc::new(mana_pool::ManaPool {
            url: urls.mana_pool_url.clone(),
        }),
    }
}

/// `GET`s a feed with a five-minute timeout, returning the status and body.
pub(crate) async fn get(
    state: &AppState,
    url: &str,
    timeout: Duration,
) -> Result<(reqwest::StatusCode, bytes::Bytes), String> {
    let response = state
        .http
        .get(url)
        .timeout(timeout)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    let body = response.bytes().await.map_err(|error| error.to_string())?;
    Ok((status, body))
}
