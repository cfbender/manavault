//! Collection and location root queries (`CollectionOperations`,
//! `LocationOperations`, and the collection parts of `QueryResolvers`).

use async_graphql::{Context, ID, Object};

use crate::collection::auto_sort::rules;
use crate::collection::bulk_clean::{self, BulkCleanOptions};
use crate::collection::export;
use crate::collection::filters::ItemFilters;
use crate::collection::graphql::inputs::{
    BulkCleanPullInput, CollectionItemFilters, CollectionItemSort, item_filters,
};
use crate::collection::graphql::mutations::parse_pulls;
use crate::collection::graphql::tools::{CollectionAutoSortRule, CollectionBulkCleanResult};
use crate::collection::graphql::types::{
    CollectionItemConnection, CollectionItemGroup, CollectionItemGroupConnection, HomeSummary,
    LocationConnection, items_connection, slice_window,
};
use crate::collection::graphql::values::{CollectionValueDashboard, CollectionValueSummary};
use crate::collection::location::{self, Location};
use crate::collection::queries::{self, Page};
use manavault_core::graphql::relay::{
    LocationRef, PageArgs, connection_from_list, from_slice, location_ref,
};
use manavault_core::graphql::{Result, internal_error, state, user_error};

#[derive(Default)]
pub struct CollectionQueries;

#[Object]
impl CollectionQueries {
    async fn home_summary(&self, ctx: &Context<'_>) -> Result<HomeSummary> {
        let pool = &state(ctx).db;
        Ok(HomeSummary {
            collection_count: queries::totals(pool, &ItemFilters::default())
                .await
                .map_err(internal_error)?
                .quantity,
            location_count: location::count(pool).await.map_err(internal_error)?,
            deck_count: queries::count_non_archived_decks(pool)
                .await
                .map_err(internal_error)?,
        })
    }

    async fn collection_items(
        &self,
        ctx: &Context<'_>,
        after: Option<String>,
        first: Option<i32>,
        before: Option<String>,
        last: Option<i32>,
        filters: Option<CollectionItemFilters>,
        sort: Option<CollectionItemSort>,
    ) -> Result<CollectionItemConnection> {
        let filters = item_filters(filters.as_ref())?;
        let args = PageArgs::new(after, first, before, last);
        items_connection(
            ctx,
            &filters,
            CollectionItemSort::sort(sort.as_ref()),
            &args,
        )
        .await
    }

    async fn collection_item_groups(
        &self,
        ctx: &Context<'_>,
        after: Option<String>,
        first: Option<i32>,
        before: Option<String>,
        last: Option<i32>,
        filters: Option<CollectionItemFilters>,
        sort: Option<CollectionItemSort>,
    ) -> Result<CollectionItemGroupConnection> {
        let filters = item_filters(filters.as_ref())?;
        let pool = &state(ctx).db;
        let total = queries::totals(pool, &filters)
            .await
            .map_err(internal_error)?
            .groups;
        let args = PageArgs::new(after, first, before, last);
        let (offset, limit) = slice_window(&args, total, 100)?;
        let groups = queries::list_item_groups(
            pool,
            &filters,
            Page {
                limit,
                offset,
                sort: CollectionItemSort::sort(sort.as_ref()),
            },
        )
        .await
        .map_err(internal_error)?
        .into_iter()
        .map(CollectionItemGroup)
        .collect();
        Ok(from_slice(groups, offset, offset > 0, offset + limit < total).into())
    }

    async fn collection_item_count(
        &self,
        ctx: &Context<'_>,
        filters: Option<CollectionItemFilters>,
    ) -> Result<i64> {
        let filters = item_filters(filters.as_ref())?;
        Ok(queries::totals(&state(ctx).db, &filters)
            .await
            .map_err(internal_error)?
            .quantity)
    }

    async fn collection_item_entry_count(
        &self,
        ctx: &Context<'_>,
        filters: Option<CollectionItemFilters>,
    ) -> Result<i64> {
        let filters = item_filters(filters.as_ref())?;
        Ok(queries::totals(&state(ctx).db, &filters)
            .await
            .map_err(internal_error)?
            .entries)
    }

    async fn collection_value_summary(
        &self,
        ctx: &Context<'_>,
        filters: Option<CollectionItemFilters>,
    ) -> Result<CollectionValueSummary> {
        let filters = item_filters(filters.as_ref())?;
        Ok(queries::value_summary(&state(ctx).db, &filters)
            .await
            .map_err(internal_error)?
            .into())
    }

    async fn collection_value_dashboard(
        &self,
        ctx: &Context<'_>,
    ) -> Result<CollectionValueDashboard> {
        Ok(CollectionValueDashboard(
            queries::value_dashboard(&state(ctx).db)
                .await
                .map_err(internal_error)?,
        ))
    }

    async fn collection_export_csv(
        &self,
        ctx: &Context<'_>,
        filters: Option<CollectionItemFilters>,
    ) -> Result<String> {
        let filters = item_filters(filters.as_ref())?;
        let state = state(ctx);
        export::export_csv(&state.db, &state.prices, &filters)
            .await
            .map_err(internal_error)
    }

    async fn collection_export_text(
        &self,
        ctx: &Context<'_>,
        filters: Option<CollectionItemFilters>,
    ) -> Result<String> {
        let filters = item_filters(filters.as_ref())?;
        export::export_text(&state(ctx).db, &filters)
            .await
            .map_err(internal_error)
    }

    async fn collection_auto_sort_rules(
        &self,
        ctx: &Context<'_>,
    ) -> Result<Vec<CollectionAutoSortRule>> {
        Ok(rules::list(&state(ctx).db)
            .await
            .map_err(internal_error)?
            .into_iter()
            .map(CollectionAutoSortRule)
            .collect())
    }

    async fn collection_bulk_clean(
        &self,
        ctx: &Context<'_>,
        max_price_cents: Option<i64>,
        min_copies: Option<i64>,
        keep_copies: Option<i64>,
        prefer_keep_foils: Option<bool>,
        kept: Option<Vec<BulkCleanPullInput>>,
    ) -> Result<CollectionBulkCleanResult> {
        let kept = parse_pulls(kept.as_deref().unwrap_or_default())?
            .into_iter()
            .map(|pull| (pull.collection_item_id, pull.quantity))
            .collect();
        let options = BulkCleanOptions {
            max_price_cents,
            min_copies,
            keep_copies,
            prefer_keep_foils,
            kept,
        };
        Ok(CollectionBulkCleanResult(
            bulk_clean::preview(&state(ctx).db, &options)
                .await
                .map_err(internal_error)?,
        ))
    }

    async fn locations(
        &self,
        ctx: &Context<'_>,
        after: Option<String>,
        first: Option<i32>,
        before: Option<String>,
        last: Option<i32>,
    ) -> Result<LocationConnection> {
        let pool = &state(ctx).db;
        let mut summaries = queries::location_summaries(pool, None)
            .await
            .map_err(internal_error)?;
        let mut locations: Vec<Location> = location::list(pool)
            .await
            .map_err(internal_error)?
            .into_iter()
            .map(|record| {
                let totals = summaries.get(&Some(record.id)).copied().unwrap_or_default();
                Location {
                    totals: Some(totals),
                    ..Location::stored(record)
                }
            })
            .collect();
        locations.push(Location::unfiled(
            summaries.remove(&None).unwrap_or_default(),
        ));
        let args = PageArgs::new(after, first, before, last);
        Ok(connection_from_list(locations, &args, None)?.into())
    }

    async fn location(&self, ctx: &Context<'_>, id: ID) -> Result<Option<Location>> {
        let pool = &state(ctx).db;
        match location_ref(&id)? {
            LocationRef::Unfiled => {
                let totals = queries::location_summaries(pool, None)
                    .await
                    .map_err(internal_error)?
                    .remove(&None)
                    .unwrap_or_default();
                Ok(Some(Location::unfiled(totals)))
            }
            LocationRef::Id(id) => {
                let record = Location::load(pool, id)
                    .await
                    .map_err(internal_error)?
                    .ok_or_else(|| user_error("Location was not found."))?;
                Ok(Some(Location::stored(record)))
            }
        }
    }
}
