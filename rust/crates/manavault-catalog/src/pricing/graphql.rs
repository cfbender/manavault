//! `pricingSettings`, `updatePricingSettings`, and `syncVendorPrices`
//! (`ManavaultWeb.Schema.Catalog.PricingOperations`).

use async_graphql::{Context, Object, SimpleObject};

use crate::graphql::{self, state};
use crate::pricing::{self, SOURCES, SetSourceError};
use crate::state::AppState;

#[derive(Debug, Clone, SimpleObject)]
pub struct PricingVendorStatus {
    pub vendor: String,
    pub price_count: i64,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Clone, SimpleObject)]
pub struct PricingSettings {
    pub source: String,
    pub sources: Vec<String>,
    pub vendors: Vec<PricingVendorStatus>,
}

#[derive(Debug, Clone, SimpleObject)]
pub struct UpdatePricingSettingsPayload {
    pub pricing_settings: Option<PricingSettings>,
}

#[derive(Debug, Clone, SimpleObject)]
pub struct SyncVendorPricesPayload {
    pub pricing_settings: Option<PricingSettings>,
}

/// `DateTime.to_iso8601/1` of a `utc_datetime_usec` value.
fn iso8601_usec(stored: &str) -> String {
    crate::timefmt::parse(stored).map_or_else(|| stored.to_owned(), crate::timefmt::utc_micros)
}

async fn settings(state: &AppState) -> graphql::Result<PricingSettings> {
    let source = pricing::source(&state.db).await?;
    let vendors = pricing::vendor_statuses(&state.db)
        .await?
        .into_iter()
        .map(|status| PricingVendorStatus {
            vendor: status.vendor.as_str().to_owned(),
            price_count: status.price_count,
            last_synced_at: status.last_synced_at.as_deref().map(iso8601_usec),
        })
        .collect();
    Ok(PricingSettings {
        source,
        sources: SOURCES.iter().map(|source| (*source).to_owned()).collect(),
        vendors,
    })
}

#[derive(Default)]
pub struct PricingQueries;

#[Object]
impl PricingQueries {
    async fn pricing_settings(&self, ctx: &Context<'_>) -> graphql::Result<PricingSettings> {
        settings(state(ctx)).await
    }
}

#[derive(Default)]
pub struct PricingMutations;

#[Object]
impl PricingMutations {
    async fn update_pricing_settings(
        &self,
        ctx: &Context<'_>,
        source: String,
    ) -> graphql::Result<Option<UpdatePricingSettingsPayload>> {
        let state = state(ctx);
        match pricing::set_source(state, &source).await {
            Ok(_) => Ok(Some(UpdatePricingSettingsPayload {
                pricing_settings: Some(settings(state).await?),
            })),
            Err(SetSourceError::Invalid(message)) => Err(graphql::user_error(message)),
            Err(SetSourceError::Db(error)) => Err(error.into()),
        }
    }

    async fn sync_vendor_prices(
        &self,
        ctx: &Context<'_>,
    ) -> graphql::Result<Option<SyncVendorPricesPayload>> {
        let state = state(ctx);
        crate::catalog::scryfall::worker::enqueue_forced(
            &state.jobs,
            &state.db,
            super::worker::NAME,
        )
        .await
        .map_err(|_| graphql::user_error("Vendor price sync could not be queued."))?;
        Ok(Some(SyncVendorPricesPayload {
            pricing_settings: Some(settings(state).await?),
        }))
    }
}
