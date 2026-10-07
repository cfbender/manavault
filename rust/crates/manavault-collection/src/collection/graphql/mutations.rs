//! Collection and location mutations (`CollectionOperations`,
//! `LocationOperations`, `CollectionMutations`, `LocationMutations`,
//! `ImportResolvers`).

use async_graphql::{Context, ErrorExtensions, ID, Object, SimpleObject};

use crate::collection::auto_sort::rules::{self, AutoSortError};
use crate::collection::auto_sort::{self, AutoSortOptions, Source};
use crate::collection::bulk_clean::{self, PullRequest, RemovePullsError};
use crate::collection::changes::{self, ItemError};
use crate::collection::graphql::inputs::{
    AutoSortCollectionInput, BulkCleanPullInput, CollectionAutoSortRuleInput,
    CollectionImportCommitInput, CollectionImportPreviewInput, CollectionImportRowInput,
    CollectionItemInput, CollectionItemSelector, CollectionItemUpdateInput, LocationInput,
    LocationUpdateInput, import_location_id, optional_location_arg, rule_inputs, selected_ids,
};
use crate::collection::graphql::tools::{
    CollectionAutoSortResult, CollectionAutoSortRule, CollectionImportPreview,
    CollectionImportResult,
};
use crate::collection::import::{self, ImportError, ImportRow, PreviewOptions};
use crate::collection::item::CollectionItem;
use crate::collection::location::{self, Location, LocationError};
use crate::graphql::relay::{LocationRef, location_ref, node_int};
use crate::graphql::{NodeKind, Result, internal_error, state, user_error};

fn item_error(error: ItemError) -> async_graphql::Error {
    match error {
        ItemError::Db(error) => internal_error(error),
        ItemError::Invalid(errors) => errors.extend(),
        other => user_error(other.to_string()),
    }
}

fn location_error(error: LocationError) -> async_graphql::Error {
    match error {
        LocationError::Db(error) => internal_error(error),
        LocationError::Invalid(errors) => errors.extend(),
        LocationError::NotFound => user_error(error.to_string()),
    }
}

fn auto_sort_error(error: AutoSortError) -> async_graphql::Error {
    match error {
        AutoSortError::Db(error) => internal_error(error),
        AutoSortError::Invalid(errors) => errors.extend(),
        AutoSortError::Item(error) => item_error(error),
        other => user_error(other.to_string()),
    }
}

fn import_error(error: ImportError) -> async_graphql::Error {
    match error {
        ImportError::Db(error) => internal_error(error),
        ImportError::Invalid(errors) => errors.extend(),
        ImportError::Item(error) => item_error(error),
        other => user_error(other.to_string()),
    }
}

/// Bulk clean pulls by raw item id (`CollectionMutations.parse_bulk_clean_pulls/1`).
pub(crate) fn parse_pulls(pulls: &[BulkCleanPullInput]) -> Result<Vec<PullRequest>> {
    pulls
        .iter()
        .map(|pull| {
            let id =
                crate::catalog::search::predicates::parse_int(pull.collection_item_id.as_str())
                    .ok_or_else(|| user_error("Invalid collection item id"))?;
            Ok(PullRequest {
                collection_item_id: id,
                quantity: pull.quantity,
            })
        })
        .collect()
}

#[derive(SimpleObject)]
pub struct CreateCollectionItemPayload {
    pub collection_item: Option<CollectionItem>,
}

#[derive(SimpleObject)]
pub struct UpdateCollectionItemPayload {
    pub collection_item: Option<CollectionItem>,
}

#[derive(SimpleObject)]
pub struct BulkUpdateCollectionItemsPayload {
    pub updated_count: i64,
}

#[derive(SimpleObject)]
pub struct SetCollectionItemsForTradeQuantityPayload {
    pub updated_count: i64,
    pub quantity: i64,
    pub total_quantity: i64,
}

#[derive(SimpleObject)]
pub struct RemoveBulkCleanPullsPayload {
    pub removed_count: i64,
}

#[derive(SimpleObject)]
pub struct BulkDeleteCollectionItemsPayload {
    pub deleted_count: i64,
}

#[derive(SimpleObject)]
pub struct DeleteCollectionItemPayload {
    pub collection_item: Option<CollectionItem>,
}

#[derive(SimpleObject)]
pub struct UpdateCollectionAutoSortRulesPayload {
    pub collection_auto_sort_rules: Vec<CollectionAutoSortRule>,
    pub rules: Vec<CollectionAutoSortRule>,
}

#[derive(SimpleObject)]
pub struct AutoSortCollectionPayload {
    pub auto_sort_result: CollectionAutoSortResult,
}

#[derive(SimpleObject)]
pub struct PreviewCollectionImportPayload {
    pub import_preview: Option<CollectionImportPreview>,
}

#[derive(SimpleObject)]
pub struct PreviewCollectionImportAutoSortPayload {
    pub auto_sort_result: CollectionAutoSortResult,
}

#[derive(SimpleObject)]
pub struct CommitCollectionImportPayload {
    pub import_result: Option<CollectionImportResult>,
}

#[derive(SimpleObject)]
pub struct CreateLocationPayload {
    pub location: Option<Location>,
}

#[derive(SimpleObject)]
pub struct UpdateLocationPayload {
    pub location: Option<Location>,
}

#[derive(SimpleObject)]
pub struct DeleteLocationPayload {
    pub location: Option<Location>,
}

fn count(value: usize) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

fn import_rows(rows: &CollectionImportCommitInput) -> Result<Vec<ImportRow>> {
    rows.rows
        .iter()
        .map(CollectionImportRowInput::row)
        .collect()
}

#[derive(Default)]
pub struct CollectionMutations;

#[Object]
impl CollectionMutations {
    async fn create_collection_item(
        &self,
        ctx: &Context<'_>,
        input: CollectionItemInput,
    ) -> Result<Option<CreateCollectionItemPayload>> {
        let changes = input.changes()?;
        let state = state(ctx);
        let item = changes::create(&state.db, &state.prices, changes)
            .await
            .map_err(item_error)?;
        Ok(Some(CreateCollectionItemPayload {
            collection_item: Some(item),
        }))
    }

    async fn update_collection_item(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: CollectionItemUpdateInput,
    ) -> Result<Option<UpdateCollectionItemPayload>> {
        let id = node_int(&id, NodeKind::CollectionItem)?;
        let changes = input.changes()?;
        let item = changes::update(&state(ctx).db, id, changes)
            .await
            .map_err(item_error)?;
        Ok(Some(UpdateCollectionItemPayload {
            collection_item: Some(item),
        }))
    }

    async fn bulk_update_collection_items(
        &self,
        ctx: &Context<'_>,
        selector: CollectionItemSelector,
        input: CollectionItemUpdateInput,
    ) -> Result<Option<BulkUpdateCollectionItemsPayload>> {
        let ids = selected_ids(ctx, &selector).await?;
        let changes = input.changes()?;
        let updated = changes::bulk_update(&state(ctx).db, &ids, changes)
            .await
            .map_err(item_error)?;
        Ok(Some(BulkUpdateCollectionItemsPayload {
            updated_count: count(updated),
        }))
    }

    async fn set_collection_items_for_trade_quantity(
        &self,
        ctx: &Context<'_>,
        selector: CollectionItemSelector,
        quantity: i64,
    ) -> Result<Option<SetCollectionItemsForTradeQuantityPayload>> {
        let ids = selected_ids(ctx, &selector).await?;
        let result = changes::set_trade_quantity(&state(ctx).db, &ids, quantity)
            .await
            .map_err(|error| match error {
                ItemError::InvalidTradeQuantity | ItemError::Missing(_) => {
                    user_error(error.to_string())
                }
                ItemError::Db(error) => internal_error(error),
                _ => user_error("Could not update trade quantity."),
            })?;
        Ok(Some(SetCollectionItemsForTradeQuantityPayload {
            updated_count: count(result.updated_count),
            quantity: result.quantity,
            total_quantity: result.total_quantity,
        }))
    }

    async fn remove_bulk_clean_pulls(
        &self,
        ctx: &Context<'_>,
        pulls: Vec<BulkCleanPullInput>,
    ) -> Result<Option<RemoveBulkCleanPullsPayload>> {
        let pulls = parse_pulls(&pulls)?;
        let removed =
            bulk_clean::remove(&state(ctx).db, &pulls)
                .await
                .map_err(|error| match error {
                    RemovePullsError::Db(error) => internal_error(error),
                    other => user_error(other.to_string()),
                })?;
        Ok(Some(RemoveBulkCleanPullsPayload {
            removed_count: removed,
        }))
    }

    async fn bulk_delete_collection_items(
        &self,
        ctx: &Context<'_>,
        selector: CollectionItemSelector,
    ) -> Result<Option<BulkDeleteCollectionItemsPayload>> {
        let ids = selected_ids(ctx, &selector).await?;
        let deleted = changes::delete_many(&state(ctx).db, &ids)
            .await
            .map_err(|error| {
                tracing::error!(%error, "bulk delete failed");
                user_error("Could not delete collection items")
            })?;
        Ok(Some(BulkDeleteCollectionItemsPayload {
            deleted_count: i64::try_from(deleted).unwrap_or(i64::MAX),
        }))
    }

    async fn delete_collection_item(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<DeleteCollectionItemPayload>> {
        let id = node_int(&id, NodeKind::CollectionItem)?;
        let item = changes::delete(&state(ctx).db, id)
            .await
            .map_err(item_error)?;
        Ok(Some(DeleteCollectionItemPayload {
            collection_item: Some(item),
        }))
    }

    // `addCollectionItemToDeck` and `bulkAddCollectionItemsToDeck` are with
    // the other allocation mutations in `deck_intel::allocations`.

    async fn update_collection_auto_sort_rules(
        &self,
        ctx: &Context<'_>,
        input: Vec<CollectionAutoSortRuleInput>,
    ) -> Result<Option<UpdateCollectionAutoSortRulesPayload>> {
        let inputs = rule_inputs(ctx, &input).await?;
        let rules = rules::replace(&state(ctx).db, &inputs)
            .await
            .map_err(auto_sort_error)?;
        Ok(Some(UpdateCollectionAutoSortRulesPayload {
            collection_auto_sort_rules: rules.iter().cloned().map(CollectionAutoSortRule).collect(),
            rules: rules.into_iter().map(CollectionAutoSortRule).collect(),
        }))
    }

    async fn auto_sort_collection(
        &self,
        ctx: &Context<'_>,
        input: Option<AutoSortCollectionInput>,
    ) -> Result<Option<AutoSortCollectionPayload>> {
        let input = input.unwrap_or_default();
        let source = match optional_location_arg(input.source_location_id.as_ref())? {
            None => Source::Collection,
            Some(LocationRef::Unfiled) => Source::Unfiled,
            Some(LocationRef::Id(id)) => Source::Location(id),
        };
        let rules = match &input.rules {
            Some(rules) => Some(rule_inputs(ctx, rules).await?),
            None => None,
        };
        let options = AutoSortOptions {
            source,
            dry_run: input.dry_run == Some(true),
            rules,
            ignore_location_debounce: false,
        };
        let state = state(ctx);
        let result = auto_sort::run(&state.db, &state.prices, &options)
            .await
            .map_err(auto_sort_error)?;
        Ok(Some(AutoSortCollectionPayload {
            auto_sort_result: CollectionAutoSortResult(result),
        }))
    }

    async fn preview_collection_import(
        &self,
        ctx: &Context<'_>,
        input: CollectionImportPreviewInput,
    ) -> Result<Option<PreviewCollectionImportPayload>> {
        let location_id = import_location_id(input.location_id.as_ref())?;
        let options = PreviewOptions {
            format: input.format.clone(),
            file_name: input.file_name.clone(),
            location_id,
            purchase_price_cents: input.purchase_price_cents,
        };
        let preview = import::preview(&state(ctx).db, &input.text, &options)
            .await
            .map_err(import_error)?;
        Ok(Some(PreviewCollectionImportPayload {
            import_preview: Some(CollectionImportPreview(preview)),
        }))
    }

    async fn preview_collection_import_auto_sort(
        &self,
        ctx: &Context<'_>,
        input: CollectionImportCommitInput,
    ) -> Result<Option<PreviewCollectionImportAutoSortPayload>> {
        let rows = import_rows(&input)?;
        let state = state(ctx);
        let result = import::preview_auto_sort(&state.db, &state.prices, &rows)
            .await
            .map_err(import_error)?;
        Ok(Some(PreviewCollectionImportAutoSortPayload {
            auto_sort_result: CollectionAutoSortResult(result),
        }))
    }

    async fn commit_collection_import(
        &self,
        ctx: &Context<'_>,
        input: CollectionImportCommitInput,
    ) -> Result<Option<CommitCollectionImportPayload>> {
        let rows = import_rows(&input)?;
        let state = state(ctx);
        let result = import::commit(
            &state.db,
            &state.prices,
            &rows,
            input.auto_sort == Some(true),
        )
        .await
        .map_err(import_error)?;
        Ok(Some(CommitCollectionImportPayload {
            import_result: Some(CollectionImportResult(result)),
        }))
    }

    async fn create_location(
        &self,
        ctx: &Context<'_>,
        input: LocationInput,
    ) -> Result<Option<CreateLocationPayload>> {
        let changes = input.changes()?;
        let record = location::create(&state(ctx).db, changes)
            .await
            .map_err(location_error)?;
        Ok(Some(CreateLocationPayload {
            location: Some(Location::stored(record)),
        }))
    }

    async fn update_location(
        &self,
        ctx: &Context<'_>,
        id: ID,
        input: LocationUpdateInput,
    ) -> Result<Option<UpdateLocationPayload>> {
        let id = location_ref(&id)?;
        let changes = input.changes()?;
        let LocationRef::Id(id) = id else {
            return Err(user_error("Unfiled cannot be edited"));
        };
        let record = location::update(&state(ctx).db, id, changes)
            .await
            .map_err(location_error)?;
        Ok(Some(UpdateLocationPayload {
            location: Some(Location::stored(record)),
        }))
    }

    async fn delete_location(
        &self,
        ctx: &Context<'_>,
        id: ID,
    ) -> Result<Option<DeleteLocationPayload>> {
        let LocationRef::Id(id) = location_ref(&id)? else {
            return Err(user_error("Unfiled cannot be deleted"));
        };
        let record = location::delete(&state(ctx).db, id)
            .await
            .map_err(location_error)?;
        Ok(Some(DeleteLocationPayload {
            location: Some(Location::stored(record)),
        }))
    }
}
