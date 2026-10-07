//! Collection and location input objects (`CollectionTypes` inputs) and their
//! decoding into domain values (`QueryResolvers.collection_filters/2`,
//! `CollectionSelector`, and the input normalizers of the mutation resolvers).

use async_graphql::{Context, ID, InputObject, MaybeUndefined};

use crate::collection::auto_sort::rules::RuleInput;
use crate::collection::changes::ItemChanges;
use crate::collection::filters::{ItemFilters, LocationFilter, Sort};
use crate::collection::import::{ImportAttrs, ImportRow, RowStatus};
use crate::collection::location::LocationChanges;
use crate::collection::queries;
use crate::graphql::relay::{LocationRef, location_ref, node_int, node_str};
use crate::graphql::{NodeKind, Result, internal_error, state, user_error};

/// `CollectionItemFilters`.
#[derive(Debug, Clone, Default, InputObject)]
pub struct CollectionItemFilters {
    pub q: Option<String>,
    pub condition: Option<String>,
    pub language: Option<String>,
    pub finish: Option<String>,
    pub location_id: Option<ID>,
    pub card_id: Option<ID>,
    pub unallocated_only: Option<bool>,
    pub added_within_days: Option<i64>,
    pub for_trade: Option<bool>,
}

/// `BulkCleanPullInput`. `collectionItemId` is a raw database id.
#[derive(Debug, Clone, InputObject)]
pub struct BulkCleanPullInput {
    pub collection_item_id: ID,
    pub quantity: i64,
}

/// `CollectionItemSort`.
#[derive(Debug, Clone, Default, InputObject)]
pub struct CollectionItemSort {
    pub field: Option<String>,
    pub direction: Option<String>,
}

impl CollectionItemSort {
    pub(crate) fn sort(sort: Option<&Self>) -> Sort {
        sort.map_or_else(Sort::default, |sort| {
            Sort::parse(sort.field.as_deref(), sort.direction.as_deref())
        })
    }
}

/// `CollectionItemSelector`: explicit ids, or every item matching `filters`
/// except `excludedIds`, so select-all never pages ids through the client.
#[derive(Debug, Clone, Default, InputObject)]
pub struct CollectionItemSelector {
    pub ids: Option<Vec<ID>>,
    pub all: Option<bool>,
    pub filters: Option<CollectionItemFilters>,
    pub excluded_ids: Option<Vec<ID>>,
}

/// `CollectionItemInput`.
#[derive(Debug, Clone, InputObject)]
pub struct CollectionItemInput {
    pub scryfall_id: ID,
    pub quantity: MaybeUndefined<i64>,
    pub condition: MaybeUndefined<String>,
    pub language: MaybeUndefined<String>,
    pub finish: MaybeUndefined<String>,
    pub location_id: MaybeUndefined<ID>,
    pub notes: MaybeUndefined<String>,
    pub purchase_price_cents: MaybeUndefined<i64>,
    pub for_trade: MaybeUndefined<bool>,
    pub for_trade_quantity: MaybeUndefined<i64>,
}

/// `CollectionItemUpdateInput`.
#[derive(Debug, Clone, Default, InputObject)]
pub struct CollectionItemUpdateInput {
    pub scryfall_id: MaybeUndefined<ID>,
    pub quantity: MaybeUndefined<i64>,
    pub condition: MaybeUndefined<String>,
    pub language: MaybeUndefined<String>,
    pub finish: MaybeUndefined<String>,
    pub location_id: MaybeUndefined<ID>,
    pub notes: MaybeUndefined<String>,
    pub purchase_price_cents: MaybeUndefined<i64>,
    pub for_trade: MaybeUndefined<bool>,
    pub for_trade_quantity: MaybeUndefined<i64>,
}

/// `CollectionImportPreviewInput`.
#[derive(Debug, Clone, InputObject)]
pub struct CollectionImportPreviewInput {
    pub text: String,
    pub format: Option<String>,
    pub file_name: Option<String>,
    pub location_id: Option<ID>,
    pub purchase_price_cents: Option<i64>,
}

/// `CollectionImportAttrsInput`.
#[derive(Debug, Clone, Default, InputObject)]
pub struct CollectionImportAttrsInput {
    pub name: MaybeUndefined<String>,
    pub set_code: MaybeUndefined<String>,
    pub collector_number: MaybeUndefined<String>,
    pub quantity: MaybeUndefined<i64>,
    pub finish: MaybeUndefined<String>,
    pub condition: MaybeUndefined<String>,
    pub language: MaybeUndefined<String>,
    pub scryfall_id: MaybeUndefined<ID>,
    pub back_scryfall_id: MaybeUndefined<ID>,
    pub location_id: MaybeUndefined<ID>,
    pub purchase_price_cents: MaybeUndefined<i64>,
}

/// `CollectionImportRowInput`.
#[derive(Debug, Clone, InputObject)]
pub struct CollectionImportRowInput {
    pub row_number: i64,
    pub status: String,
    pub attrs: CollectionImportAttrsInput,
}

/// `CollectionImportCommitInput`.
#[derive(Debug, Clone, InputObject)]
pub struct CollectionImportCommitInput {
    pub rows: Vec<CollectionImportRowInput>,
    pub auto_sort: Option<bool>,
}

/// `CollectionAutoSortRuleInput`.
#[derive(Debug, Clone, InputObject)]
pub struct CollectionAutoSortRuleInput {
    pub id: Option<ID>,
    pub name: String,
    pub enabled: bool,
    pub priority: i64,
    pub target_location_id: ID,
    pub color_mode: String,
    pub colors: Vec<String>,
    pub type_line_includes: Vec<String>,
    pub type_line_excludes: Vec<String>,
    pub rarities: Vec<String>,
    pub min_price_cents: Option<i64>,
    pub max_price_cents: Option<i64>,
    pub set_operator: Option<String>,
    pub set_codes: Option<Vec<String>>,
    pub release_date_operator: Option<String>,
    pub release_date: Option<String>,
}

/// `AutoSortCollectionInput`.
#[derive(Debug, Clone, Default, InputObject)]
pub struct AutoSortCollectionInput {
    pub source_location_id: Option<ID>,
    pub dry_run: Option<bool>,
    pub rules: Option<Vec<CollectionAutoSortRuleInput>>,
}

/// `LocationUpdateInput`.
#[derive(Debug, Clone, Default, InputObject)]
pub struct LocationUpdateInput {
    pub name: MaybeUndefined<String>,
    pub kind: MaybeUndefined<String>,
    pub description: MaybeUndefined<String>,
    pub cover_scryfall_id: MaybeUndefined<ID>,
}

/// `LocationInput`.
#[derive(Debug, Clone, InputObject)]
pub struct LocationInput {
    pub name: String,
    pub kind: MaybeUndefined<String>,
    pub description: MaybeUndefined<String>,
    pub cover_scryfall_id: MaybeUndefined<ID>,
}

/// A location argument that also accepts the raw id `"unfiled"`
/// (`LocationMutations.location_id/2`).
pub(crate) fn location_arg(id: &ID) -> Result<LocationRef> {
    if id.as_str() == "unfiled" {
        return Ok(LocationRef::Unfiled);
    }
    location_ref(id)
}

/// Like [`location_arg`], with `null` and `""` absent.
pub(crate) fn optional_location_arg(id: Option<&ID>) -> Result<Option<LocationRef>> {
    match id {
        None => Ok(None),
        Some(id) if id.is_empty() => Ok(None),
        Some(id) => location_arg(id).map(Some),
    }
}

/// `QueryResolvers.collection_filters/2`.
pub(crate) fn item_filters(input: Option<&CollectionItemFilters>) -> Result<ItemFilters> {
    let Some(input) = input else {
        return Ok(ItemFilters::default());
    };
    let location =
        optional_location_arg(input.location_id.as_ref())?.map(|location| match location {
            LocationRef::Unfiled => LocationFilter::Unfiled,
            LocationRef::Id(id) => LocationFilter::Id(id),
        });
    // `QueryResolvers.card_id/2`: a card global id, else the raw oracle id.
    let card_id = match &input.card_id {
        None => String::new(),
        Some(id) => node_str(id, NodeKind::Card).unwrap_or_else(|_| id.to_string()),
    };
    Ok(ItemFilters {
        q: input.q.clone().unwrap_or_default(),
        condition: input.condition.clone().unwrap_or_default(),
        language: input.language.clone().unwrap_or_default(),
        finish: input.finish.clone().unwrap_or_default(),
        location,
        card_id,
        include_list_locations: false,
        unallocated_only: input.unallocated_only == Some(true),
        for_trade: input.for_trade == Some(true),
        added_within_days: input.added_within_days,
    })
}

/// Collection item global ids to database ids (`CollectionSelector.parse_ids/2`).
pub(crate) fn item_ids(ids: &[ID]) -> Result<Vec<i64>> {
    ids.iter()
        .map(|id| node_int(id, NodeKind::CollectionItem))
        .collect()
}

/// The items a selector names (`CollectionSelector.collection_item_ids/2`).
pub async fn selected_ids(
    ctx: &Context<'_>,
    selector: &CollectionItemSelector,
) -> Result<Vec<i64>> {
    if selector.all != Some(true) {
        return item_ids(selector.ids.as_deref().unwrap_or_default());
    }
    let filters = item_filters(Some(&selector.filters.clone().unwrap_or_default()))?;
    let excluded = item_ids(selector.excluded_ids.as_deref().unwrap_or_default())?;
    Ok(queries::list_item_ids(&state(ctx).db, &filters)
        .await
        .map_err(internal_error)?
        .into_iter()
        .filter(|id| !excluded.contains(id))
        .collect())
}

/// `RelayHelpers.put_optional_node_id/4` for printing ids.
fn printing_change(id: &MaybeUndefined<ID>) -> Result<MaybeUndefined<String>> {
    Ok(match id {
        MaybeUndefined::Undefined => MaybeUndefined::Undefined,
        MaybeUndefined::Null => MaybeUndefined::Null,
        MaybeUndefined::Value(id) if id.is_empty() => MaybeUndefined::Null,
        MaybeUndefined::Value(id) => MaybeUndefined::Value(node_str(id, NodeKind::Printing)?),
    })
}

/// A location id change; the unfiled location clears it
/// (`CollectionMutations.normalize_unfiled_location/1`).
fn location_change(id: &MaybeUndefined<ID>) -> Result<MaybeUndefined<i64>> {
    Ok(match id {
        MaybeUndefined::Undefined => MaybeUndefined::Undefined,
        MaybeUndefined::Null => MaybeUndefined::Null,
        MaybeUndefined::Value(id) if id.is_empty() => MaybeUndefined::Null,
        MaybeUndefined::Value(id) => match location_ref(id)? {
            LocationRef::Unfiled => MaybeUndefined::Null,
            LocationRef::Id(id) => MaybeUndefined::Value(id),
        },
    })
}

impl CollectionItemInput {
    pub(crate) fn changes(&self) -> Result<ItemChanges> {
        let update = CollectionItemUpdateInput {
            scryfall_id: MaybeUndefined::Value(self.scryfall_id.clone()),
            quantity: self.quantity,
            condition: self.condition.clone(),
            language: self.language.clone(),
            finish: self.finish.clone(),
            location_id: self.location_id.clone(),
            notes: self.notes.clone(),
            purchase_price_cents: self.purchase_price_cents,
            for_trade: self.for_trade,
            for_trade_quantity: self.for_trade_quantity,
        };
        update.changes()
    }
}

impl CollectionItemUpdateInput {
    pub(crate) fn changes(&self) -> Result<ItemChanges> {
        Ok(ItemChanges {
            scryfall_id: printing_change(&self.scryfall_id)?,
            quantity: self.quantity,
            condition: self.condition.clone(),
            language: self.language.clone(),
            finish: self.finish.clone(),
            location_id: location_change(&self.location_id)?,
            notes: self.notes.clone(),
            purchase_price_cents: self.purchase_price_cents,
            for_trade: self.for_trade,
            for_trade_quantity: self.for_trade_quantity,
        })
    }
}

/// `ImportResolvers.import_location_id/2`: blank and unfiled are no
/// location; an integer or a location global id is a location.
pub(crate) fn import_location_id(id: Option<&ID>) -> Result<Option<i64>> {
    let Some(id) = id else {
        return Ok(None);
    };
    if id.is_empty() || id.as_str() == "unfiled" {
        return Ok(None);
    }
    if let Some(id) = crate::catalog::search::predicates::parse_int(id.as_str()) {
        return Ok(Some(id));
    }
    Ok(match location_ref(id)? {
        LocationRef::Unfiled => None,
        LocationRef::Id(id) => Some(id),
    })
}

/// An import row's printing id: a raw Scryfall id (what the preview
/// returns), or a `Printing` global id.
///
/// Bug in earlier releases (fixed here): the import page's `selectCandidate` writes the
/// chosen candidate's `id` (a `Printing` global id) into
/// `attrs.scryfallId`, but `ImportResolvers.collection_import_row/2` passed
/// it through undecoded, so committing (or auto-sort previewing) an import
/// after picking a printing for an ambiguous row always failed with "A card
/// printing in this import no longer exists." Found by the parity harness.
fn raw_id_change(id: &MaybeUndefined<ID>) -> MaybeUndefined<String> {
    match id {
        MaybeUndefined::Undefined => MaybeUndefined::Undefined,
        MaybeUndefined::Null => MaybeUndefined::Null,
        MaybeUndefined::Value(id) => {
            MaybeUndefined::Value(match crate::graphql::relay::from_global_id(id.as_str()) {
                Some((NodeKind::Printing, raw)) => raw,
                _ => id.to_string(),
            })
        }
    }
}

impl CollectionImportRowInput {
    /// `ImportResolvers.collection_import_row/2`.
    pub(crate) fn row(&self) -> Result<ImportRow> {
        let attrs = &self.attrs;
        let location_id = import_location_id(attrs.location_id.value())?;
        Ok(ImportRow {
            row_number: self.row_number,
            status: RowStatus::parse(&self.status),
            attrs: ImportAttrs {
                name: attrs.name.clone(),
                set_code: attrs.set_code.clone(),
                collector_number: attrs.collector_number.clone(),
                quantity: attrs.quantity,
                finish: attrs.finish.clone(),
                condition: attrs.condition.clone(),
                language: attrs.language.clone(),
                scryfall_id: raw_id_change(&attrs.scryfall_id),
                back_scryfall_id: raw_id_change(&attrs.back_scryfall_id),
                location_id,
                purchase_price_cents: attrs.purchase_price_cents,
            },
            printing: None,
            candidates: Vec::new(),
        })
    }
}

impl CollectionAutoSortRuleInput {
    /// The rule with its target decoded; the target must be stored storage
    /// (`LocationMutations.normalize_auto_sort_rule_input/2`).
    pub(crate) async fn rule(&self, ctx: &Context<'_>) -> Result<RuleInput> {
        use crate::collection::location::{AutoSortTarget, auto_sort_target};
        let target = match location_arg(&self.target_location_id)? {
            LocationRef::Unfiled => {
                return Err(user_error("Unfiled cannot be an auto-sort target."));
            }
            LocationRef::Id(id) => id,
        };
        match auto_sort_target(&state(ctx).db, target)
            .await
            .map_err(internal_error)?
        {
            AutoSortTarget::Valid => {}
            AutoSortTarget::NotStorage => {
                return Err(user_error("Auto-sort target must be a box or binder."));
            }
            AutoSortTarget::NotFound => {
                return Err(user_error("Auto-sort target location was not found."));
            }
        }
        Ok(RuleInput {
            name: Some(self.name.clone()),
            enabled: Some(self.enabled),
            priority: Some(self.priority),
            target_location_id: Some(target),
            color_mode: Some(self.color_mode.clone()),
            colors: Some(self.colors.clone()),
            type_line_includes: Some(self.type_line_includes.clone()),
            type_line_excludes: Some(self.type_line_excludes.clone()),
            rarities: Some(self.rarities.clone()),
            min_price_cents: self.min_price_cents,
            max_price_cents: self.max_price_cents,
            set_operator: self.set_operator.clone(),
            set_codes: self.set_codes.clone(),
            release_date_operator: self.release_date_operator.clone(),
            release_date: self.release_date.clone(),
        })
    }
}

/// Decodes and checks every rule input in order.
pub(crate) async fn rule_inputs(
    ctx: &Context<'_>,
    inputs: &[CollectionAutoSortRuleInput],
) -> Result<Vec<RuleInput>> {
    let mut rules = Vec::with_capacity(inputs.len());
    for input in inputs {
        rules.push(input.rule(ctx).await?);
    }
    Ok(rules)
}

fn cover_change(id: &MaybeUndefined<ID>) -> Result<MaybeUndefined<String>> {
    printing_change(id)
}

impl LocationInput {
    pub(crate) fn changes(&self) -> Result<LocationChanges> {
        Ok(LocationChanges {
            name: MaybeUndefined::Value(self.name.clone()),
            kind: self.kind.clone(),
            description: self.description.clone(),
            cover_scryfall_id: cover_change(&self.cover_scryfall_id)?,
        })
    }
}

impl LocationUpdateInput {
    pub(crate) fn changes(&self) -> Result<LocationChanges> {
        Ok(LocationChanges {
            name: self.name.clone(),
            kind: self.kind.clone(),
            description: self.description.clone(),
            cover_scryfall_id: cover_change(&self.cover_scryfall_id)?,
        })
    }
}
