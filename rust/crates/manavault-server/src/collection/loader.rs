//! Batched collection loads for GraphQL resolvers (the collection parts of
//! `Manavault.Catalog.Dataloader`): deck allocations per item, owned copies
//! per card, location value summaries, and location cover printings.
//!
//! Resolvers fall back to direct queries when no loader is registered.

use std::collections::HashMap;
use std::sync::Arc;

use async_graphql::Context;
use async_graphql::dataloader::{DataLoader, Loader};
use lotus::{OracleId, ScryfallId};
use sqlx::SqlitePool;

use crate::catalog::printing::Printing;
use crate::collection::queries::{self, ItemAllocations, ValueTotals};

/// Loads collection aggregates in batches.
pub struct CollectionLoader {
    pool: SqlitePool,
}

/// Deck allocations of a collection item.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct AllocationsKey(pub i64);

/// Owned copies of a card outside lists.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct OwnedCopiesKey(pub OracleId);

/// The value summary of a stored location's unallocated items.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct LocationTotalsKey(pub i64);

/// A printing (with its card) by Scryfall id.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct PrintingKey(pub ScryfallId);

/// Database errors, shareable across the waiting resolvers.
pub type LoadError = Arc<sqlx::Error>;

impl Loader<AllocationsKey> for CollectionLoader {
    type Value = Arc<ItemAllocations>;
    type Error = LoadError;

    async fn load(
        &self,
        keys: &[AllocationsKey],
    ) -> Result<HashMap<AllocationsKey, Self::Value>, Self::Error> {
        let ids: Vec<i64> = keys.iter().map(|key| key.0).collect();
        Ok(queries::allocations(&self.pool, &ids)
            .await
            .map_err(Arc::new)?
            .into_iter()
            .map(|(id, allocations)| (AllocationsKey(id), Arc::new(allocations)))
            .collect())
    }
}

impl Loader<OwnedCopiesKey> for CollectionLoader {
    type Value = i64;
    type Error = LoadError;

    async fn load(
        &self,
        keys: &[OwnedCopiesKey],
    ) -> Result<HashMap<OwnedCopiesKey, Self::Value>, Self::Error> {
        let ids: Vec<OracleId> = keys.iter().map(|key| key.0.clone()).collect();
        Ok(queries::owned_copies(&self.pool, &ids)
            .await
            .map_err(Arc::new)?
            .into_iter()
            .map(|(id, owned)| (OwnedCopiesKey(id), owned))
            .collect())
    }
}

impl Loader<LocationTotalsKey> for CollectionLoader {
    type Value = ValueTotals;
    type Error = LoadError;

    async fn load(
        &self,
        keys: &[LocationTotalsKey],
    ) -> Result<HashMap<LocationTotalsKey, Self::Value>, Self::Error> {
        let ids: Vec<i64> = keys.iter().map(|key| key.0).collect();
        Ok(queries::location_summaries(&self.pool, Some(&ids))
            .await
            .map_err(Arc::new)?
            .into_iter()
            .filter_map(|(id, totals)| Some((LocationTotalsKey(id?), totals)))
            .collect())
    }
}

impl Loader<PrintingKey> for CollectionLoader {
    type Value = Printing;
    type Error = LoadError;

    async fn load(
        &self,
        keys: &[PrintingKey],
    ) -> Result<HashMap<PrintingKey, Self::Value>, Self::Error> {
        let ids: Vec<ScryfallId> = keys.iter().map(|key| key.0.clone()).collect();
        Ok(Printing::load_many(&self.pool, &ids)
            .await
            .map_err(Arc::new)?
            .into_iter()
            .map(|(id, printing)| (PrintingKey(id), printing))
            .collect())
    }
}

/// The loader to register as schema data.
#[must_use]
pub fn data_loader(pool: SqlitePool) -> DataLoader<CollectionLoader> {
    DataLoader::new(CollectionLoader { pool }, tokio::spawn)
}

fn loader<'a>(ctx: &Context<'a>) -> Option<&'a DataLoader<CollectionLoader>> {
    ctx.data_opt::<DataLoader<CollectionLoader>>()
}

fn pool<'a>(ctx: &Context<'a>) -> &'a SqlitePool {
    &crate::graphql::state(ctx).db
}

/// A collection item's deck allocations, batched across the request.
pub async fn allocations(
    ctx: &Context<'_>,
    item_id: i64,
) -> async_graphql::Result<Arc<ItemAllocations>> {
    let found = match loader(ctx) {
        Some(loader) => loader
            .load_one(AllocationsKey(item_id))
            .await
            .map_err(crate::graphql::internal_error)?,
        None => queries::allocations(pool(ctx), &[item_id])
            .await
            .map_err(crate::graphql::internal_error)?
            .remove(&item_id)
            .map(Arc::new),
    };
    Ok(found.unwrap_or_default())
}

/// Owned copies of a card, batched across the request.
pub async fn owned_copies(ctx: &Context<'_>, oracle_id: &OracleId) -> async_graphql::Result<i64> {
    let found = match loader(ctx) {
        Some(loader) => loader
            .load_one(OwnedCopiesKey(oracle_id.clone()))
            .await
            .map_err(crate::graphql::internal_error)?,
        None => queries::owned_copies(pool(ctx), std::slice::from_ref(oracle_id))
            .await
            .map_err(crate::graphql::internal_error)?
            .remove(oracle_id),
    };
    Ok(found.unwrap_or(0))
}

/// A stored location's value summary, batched across the request.
pub async fn location_totals(
    ctx: &Context<'_>,
    location_id: i64,
) -> async_graphql::Result<ValueTotals> {
    let found = match loader(ctx) {
        Some(loader) => loader
            .load_one(LocationTotalsKey(location_id))
            .await
            .map_err(crate::graphql::internal_error)?,
        None => queries::location_summaries(pool(ctx), Some(&[location_id]))
            .await
            .map_err(crate::graphql::internal_error)?
            .remove(&Some(location_id)),
    };
    Ok(found.unwrap_or_default())
}

/// A printing with its card, batched across the request.
pub async fn printing(
    ctx: &Context<'_>,
    scryfall_id: &ScryfallId,
) -> async_graphql::Result<Option<Printing>> {
    match loader(ctx) {
        Some(loader) => loader
            .load_one(PrintingKey(scryfall_id.clone()))
            .await
            .map_err(crate::graphql::internal_error),
        None => Printing::load(pool(ctx), scryfall_id)
            .await
            .map_err(crate::graphql::internal_error),
    }
}
