//! Batched catalog loads for GraphQL resolvers (`Manavault.Catalog.Dataloader`).
//!
//! Register [`data_loader`] on a schema to batch the card, printings, and
//! produced-token lookups of many parents into one query each. Resolvers fall
//! back to direct queries when no loader is registered.

use std::collections::HashMap;
use std::sync::Arc;

use async_graphql::Context;
use async_graphql::dataloader::{DataLoader, Loader};
use lotus::OracleId;
use sqlx::SqlitePool;

use crate::catalog::card::{Card, CardRecord};
use crate::catalog::printing::{self, Printing};
use crate::tokens::ProducedToken;
use crate::tokens::produced;

/// Loads catalog rows in batches.
pub struct CatalogLoader {
    pool: SqlitePool,
}

/// A card by oracle id.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct CardKey(pub OracleId);

/// Every printing of a card, with owned counts, newest first.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PrintingsKey(pub OracleId);

/// The tokens a card creates.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ProducedTokensKey(pub OracleId);

/// Database errors, shareable across the waiting resolvers.
pub type LoadError = Arc<sqlx::Error>;

fn oracle_ids<K>(keys: &[K], id: impl Fn(&K) -> &OracleId) -> Vec<OracleId> {
    keys.iter().map(|key| id(key).clone()).collect()
}

impl Loader<CardKey> for CatalogLoader {
    type Value = Arc<CardRecord>;
    type Error = LoadError;

    async fn load(&self, keys: &[CardKey]) -> Result<HashMap<CardKey, Self::Value>, Self::Error> {
        let records = crate::catalog::card::load_records(&self.pool, &oracle_ids(keys, |k| &k.0))
            .await
            .map_err(Arc::new)?;
        Ok(records
            .into_iter()
            .map(|record| (CardKey(record.oracle_id.clone()), Arc::new(record)))
            .collect())
    }
}

impl Loader<PrintingsKey> for CatalogLoader {
    type Value = Arc<Vec<Printing>>;
    type Error = LoadError;

    async fn load(
        &self,
        keys: &[PrintingsKey],
    ) -> Result<HashMap<PrintingsKey, Self::Value>, Self::Error> {
        let grouped =
            printing::printings_with_owned_counts(&self.pool, &oracle_ids(keys, |k| &k.0))
                .await
                .map_err(Arc::new)?;
        Ok(grouped
            .into_iter()
            .map(|(oracle_id, printings)| (PrintingsKey(oracle_id), Arc::new(printings)))
            .collect())
    }
}

impl Loader<ProducedTokensKey> for CatalogLoader {
    type Value = Arc<Vec<ProducedToken>>;
    type Error = LoadError;

    async fn load(
        &self,
        keys: &[ProducedTokensKey],
    ) -> Result<HashMap<ProducedTokensKey, Self::Value>, Self::Error> {
        let produced = produced::by_oracle_ids(&self.pool, &oracle_ids(keys, |k| &k.0))
            .await
            .map_err(Arc::new)?;
        Ok(produced
            .into_iter()
            .map(|(oracle_id, tokens)| (ProducedTokensKey(oracle_id), Arc::new(tokens)))
            .collect())
    }
}

/// The loader to register as schema data.
#[must_use]
pub fn data_loader(pool: SqlitePool) -> DataLoader<CatalogLoader> {
    DataLoader::new(CatalogLoader { pool }, tokio::spawn)
}

fn loader<'a>(ctx: &Context<'a>) -> Option<&'a DataLoader<CatalogLoader>> {
    ctx.data_opt::<DataLoader<CatalogLoader>>()
}

fn load_error(error: impl std::fmt::Display) -> async_graphql::Error {
    tracing::error!(%error, "catalog load failed");
    async_graphql::Error::new("Something went wrong.")
}

/// A card by oracle id, batched across the request.
pub async fn card(ctx: &Context<'_>, oracle_id: &OracleId) -> async_graphql::Result<Option<Card>> {
    let record = match loader(ctx) {
        Some(loader) => loader
            .load_one(CardKey(oracle_id.clone()))
            .await
            .map_err(load_error)?,
        None => {
            crate::catalog::card::load_record(&manavault_core::graphql::state(ctx).db, oracle_id)
                .await
                .map_err(load_error)?
                .map(Arc::new)
        }
    };
    Ok(record.map(Card::from))
}

/// A card's printings with owned counts, batched across the request.
pub async fn printings_of(
    ctx: &Context<'_>,
    oracle_id: &OracleId,
) -> async_graphql::Result<Arc<Vec<Printing>>> {
    let printings = match loader(ctx) {
        Some(loader) => loader
            .load_one(PrintingsKey(oracle_id.clone()))
            .await
            .map_err(load_error)?,
        None => printing::printings_with_owned_counts(
            &manavault_core::graphql::state(ctx).db,
            std::slice::from_ref(oracle_id),
        )
        .await
        .map_err(load_error)?
        .remove(oracle_id)
        .map(Arc::new),
    };
    Ok(printings.unwrap_or_default())
}

/// The tokens a card creates, batched across the request.
pub async fn produced_tokens(
    ctx: &Context<'_>,
    oracle_id: &OracleId,
) -> async_graphql::Result<Arc<Vec<ProducedToken>>> {
    let tokens = match loader(ctx) {
        Some(loader) => loader
            .load_one(ProducedTokensKey(oracle_id.clone()))
            .await
            .map_err(load_error)?,
        None => produced::by_oracle_ids(
            &manavault_core::graphql::state(ctx).db,
            std::slice::from_ref(oracle_id),
        )
        .await
        .map_err(load_error)?
        .remove(oracle_id)
        .map(Arc::new),
    };
    Ok(tokens.unwrap_or_default())
}
