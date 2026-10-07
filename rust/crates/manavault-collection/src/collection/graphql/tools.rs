//! GraphQL types of the collection tools: auto-sort rules and results, bulk
//! clean suggestions, and import previews.

use async_graphql::{Context, ID, Object};

use crate::catalog::printing::Printing;
use crate::collection::auto_sort::rules::{AutoSortRule, decode_list};
use crate::collection::auto_sort::{AutoSortMove, AutoSortResult};
use crate::collection::bulk_clean::{BulkCleanCard, BulkCleanPull, BulkCleanResult};
use crate::collection::import::{ImportAttrs, ImportPreview, ImportResult, ImportRow};
use crate::collection::location::Location;

fn raw_id(id: i64) -> ID {
    ID(id.to_string())
}

/// `CollectionAutoSortRule`.
pub struct CollectionAutoSortRule(pub AutoSortRule);

#[Object]
impl CollectionAutoSortRule {
    async fn id(&self) -> ID {
        raw_id(self.0.record.id)
    }

    async fn name(&self) -> &str {
        &self.0.record.name
    }

    async fn enabled(&self) -> bool {
        self.0.record.enabled
    }

    async fn priority(&self) -> i64 {
        self.0.record.priority
    }

    async fn target_location(&self) -> Location {
        Location::stored(self.0.target_location.clone())
    }

    async fn color_mode(&self) -> &str {
        &self.0.record.color_mode
    }

    async fn colors(&self) -> Vec<String> {
        decode_list(&self.0.record.colors)
    }

    async fn type_line_includes(&self) -> Vec<String> {
        decode_list(&self.0.record.type_line_includes)
    }

    async fn type_line_excludes(&self) -> Vec<String> {
        decode_list(&self.0.record.type_line_excludes)
    }

    async fn rarities(&self) -> Vec<String> {
        decode_list(&self.0.record.rarities)
    }

    async fn min_price_cents(&self) -> Option<i64> {
        self.0.record.min_price_cents
    }

    async fn max_price_cents(&self) -> Option<i64> {
        self.0.record.max_price_cents
    }

    async fn set_operator(&self) -> &str {
        &self.0.record.set_operator
    }

    async fn set_codes(&self) -> Vec<String> {
        decode_list(&self.0.record.set_codes)
    }

    async fn release_date_operator(&self) -> &str {
        &self.0.record.release_date_operator
    }

    async fn release_date(&self) -> Option<&str> {
        self.0.record.release_date.as_deref()
    }
}

/// `CollectionAutoSortMove`. Ids are raw database ids.
pub struct CollectionAutoSortMove(pub AutoSortMove);

#[Object]
impl CollectionAutoSortMove {
    async fn collection_item_id(&self) -> ID {
        raw_id(self.0.collection_item_id)
    }

    async fn card_name(&self) -> &str {
        &self.0.card_name
    }

    async fn card_id(&self) -> Option<ID> {
        self.0.card_id.clone().map(ID)
    }

    async fn set_code(&self) -> &str {
        &self.0.set_code
    }

    async fn collector_number(&self) -> &str {
        &self.0.collector_number
    }

    async fn image_url(&self) -> Option<&str> {
        self.0.image_url.as_deref()
    }

    async fn quantity(&self) -> i64 {
        self.0.quantity
    }

    async fn finish(&self) -> &str {
        &self.0.finish
    }

    async fn from_location_id(&self) -> Option<ID> {
        self.0.from_location_id.map(raw_id)
    }

    async fn from_location_name(&self) -> &str {
        &self.0.from_location_name
    }

    async fn to_location_id(&self) -> ID {
        raw_id(self.0.to_location_id)
    }

    async fn to_location_name(&self) -> &str {
        &self.0.to_location_name
    }
}

/// `CollectionAutoSortResult`.
pub struct CollectionAutoSortResult(pub AutoSortResult);

#[Object]
impl CollectionAutoSortResult {
    async fn checked_count(&self) -> i64 {
        self.0.checked_count
    }

    async fn moved_count(&self) -> i64 {
        self.0.moved_count
    }

    async fn skipped_count(&self) -> i64 {
        self.0.skipped_count
    }

    async fn dry_run(&self) -> bool {
        self.0.dry_run
    }

    async fn moves(&self) -> Vec<CollectionAutoSortMove> {
        self.0
            .moves
            .iter()
            .cloned()
            .map(CollectionAutoSortMove)
            .collect()
    }
}

/// `CollectionBulkCleanPull`. Ids are raw database ids.
pub struct CollectionBulkCleanPull(pub BulkCleanPull);

#[Object]
impl CollectionBulkCleanPull {
    async fn collection_item_id(&self) -> ID {
        raw_id(self.0.collection_item_id)
    }

    async fn card_id(&self) -> ID {
        ID(self.0.card_id.clone())
    }

    async fn card_name(&self) -> &str {
        &self.0.card_name
    }

    async fn set_code(&self) -> &str {
        &self.0.set_code
    }

    async fn collector_number(&self) -> &str {
        &self.0.collector_number
    }

    async fn image_url(&self) -> Option<&str> {
        self.0.image_url.as_deref()
    }

    async fn finish(&self) -> &str {
        &self.0.finish
    }

    async fn price_cents(&self) -> i64 {
        self.0.price_cents
    }

    async fn owned_quantity(&self) -> i64 {
        self.0.owned_quantity
    }

    async fn quantity(&self) -> i64 {
        self.0.quantity
    }

    async fn from_location_id(&self) -> Option<ID> {
        self.0.from_location_id.map(raw_id)
    }

    async fn from_location_name(&self) -> &str {
        &self.0.from_location_name
    }
}

/// `CollectionBulkCleanCard`.
pub struct CollectionBulkCleanCard(pub BulkCleanCard);

#[Object]
impl CollectionBulkCleanCard {
    async fn card_id(&self) -> ID {
        ID(self.0.card_id.clone())
    }

    async fn card_name(&self) -> &str {
        &self.0.card_name
    }

    async fn type_line(&self) -> Option<&str> {
        self.0.type_line.as_deref()
    }

    async fn colors(&self) -> &[String] {
        &self.0.colors
    }

    async fn image_url(&self) -> Option<&str> {
        self.0.image_url.as_deref()
    }

    async fn total_copies(&self) -> i64 {
        self.0.total_copies
    }

    async fn pull_quantity(&self) -> i64 {
        self.0.pull_quantity
    }

    async fn swappable_copies(&self) -> i64 {
        self.0.swappable_copies
    }

    async fn pull_value_cents(&self) -> i64 {
        self.0.pull_value_cents
    }

    async fn pulls(&self) -> Vec<CollectionBulkCleanPull> {
        self.0
            .pulls
            .iter()
            .cloned()
            .map(CollectionBulkCleanPull)
            .collect()
    }
}

/// `CollectionBulkCleanResult`.
pub struct CollectionBulkCleanResult(pub BulkCleanResult);

#[Object]
impl CollectionBulkCleanResult {
    async fn max_price_cents(&self) -> i64 {
        self.0.max_price_cents
    }

    async fn min_copies(&self) -> i64 {
        self.0.min_copies
    }

    async fn keep_copies(&self) -> i64 {
        self.0.keep_copies
    }

    async fn prefer_keep_foils(&self) -> bool {
        self.0.prefer_keep_foils
    }

    async fn card_count(&self) -> i64 {
        self.0.card_count
    }

    async fn pull_quantity(&self) -> i64 {
        self.0.pull_quantity
    }

    async fn pull_value_cents(&self) -> i64 {
        self.0.pull_value_cents
    }

    async fn cards(&self) -> Vec<CollectionBulkCleanCard> {
        self.0
            .cards
            .iter()
            .cloned()
            .map(CollectionBulkCleanCard)
            .collect()
    }
}

/// `CollectionImportAttrs` (`ValueResolvers.map_value/3`).
pub struct CollectionImportAttrs(pub ImportAttrs);

#[Object]
impl CollectionImportAttrs {
    async fn name(&self) -> Option<&String> {
        self.0.name.value()
    }

    async fn set_code(&self) -> Option<&String> {
        self.0.set_code.value()
    }

    async fn collector_number(&self) -> Option<&String> {
        self.0.collector_number.value()
    }

    async fn quantity(&self) -> Option<i64> {
        self.0.quantity.value().copied()
    }

    async fn finish(&self) -> Option<&String> {
        self.0.finish.value()
    }

    async fn condition(&self) -> Option<&String> {
        self.0.condition.value()
    }

    async fn language(&self) -> Option<&String> {
        self.0.language.value()
    }

    async fn scryfall_id(&self) -> Option<ID> {
        self.0.scryfall_id.value().cloned().map(ID)
    }

    async fn back_scryfall_id(&self) -> Option<ID> {
        self.0.back_scryfall_id.value().cloned().map(ID)
    }

    async fn location_id(&self) -> Option<ID> {
        self.0.location_id.map(raw_id)
    }

    async fn purchase_price_cents(&self) -> Option<i64> {
        self.0.purchase_price_cents.value().copied()
    }
}

/// `CollectionImportRow`.
pub struct CollectionImportRow(pub ImportRow);

#[Object]
impl CollectionImportRow {
    async fn row_number(&self) -> i64 {
        self.0.row_number
    }

    async fn status(&self) -> &str {
        self.0.status.as_str()
    }

    async fn attrs(&self) -> CollectionImportAttrs {
        CollectionImportAttrs(self.0.attrs.clone())
    }

    async fn printing(&self) -> Option<&Printing> {
        self.0.printing.as_ref()
    }

    async fn candidates(&self) -> &[Printing] {
        &self.0.candidates
    }
}

/// `CollectionImportPreview`.
pub struct CollectionImportPreview(pub ImportPreview);

#[Object]
impl CollectionImportPreview {
    async fn location_id(&self) -> Option<ID> {
        self.0.location_id.map(raw_id)
    }

    async fn total(&self) -> i64 {
        self.0.total()
    }

    async fn exact(&self) -> i64 {
        self.0.exact()
    }

    async fn ambiguous(&self) -> i64 {
        self.0.ambiguous()
    }

    async fn unresolved(&self) -> i64 {
        self.0.unresolved()
    }

    async fn rows(&self, _ctx: &Context<'_>) -> Vec<CollectionImportRow> {
        self.0
            .rows
            .iter()
            .cloned()
            .map(CollectionImportRow)
            .collect()
    }
}

/// `CollectionImportResult`.
pub struct CollectionImportResult(pub ImportResult);

#[Object]
impl CollectionImportResult {
    async fn imported(&self) -> i64 {
        self.0.imported
    }

    async fn skipped(&self) -> i64 {
        self.0.skipped
    }

    async fn auto_sorted(&self) -> i64 {
        self.0.auto_sorted
    }
}
