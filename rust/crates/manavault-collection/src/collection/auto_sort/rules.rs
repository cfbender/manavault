//! Stored auto-sort rules (`Catalog.AutoSortRule`, `ListAutoSortRules`,
//! `ReplaceAutoSortRules`) and the rule form the matcher uses
//! (`AutoSort.Rules`).

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::collection::changes::FieldErrors;
use crate::collection::location::{LocationKind, LocationRecord, json_ids};
use crate::{location_query, timefmt};

/// A `collection_auto_sort_rules` row. List columns hold JSON text.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AutoSortRuleRecord {
    pub id: i64,
    pub name: String,
    pub enabled: bool,
    pub priority: i64,
    pub target_location_id: i64,
    pub color_mode: String,
    pub colors: String,
    pub type_line_includes: String,
    pub type_line_excludes: String,
    pub rarities: String,
    pub min_price_cents: Option<i64>,
    pub max_price_cents: Option<i64>,
    pub set_operator: String,
    pub set_codes: String,
    pub release_date_operator: String,
    /// `YYYY-MM-DD`.
    pub release_date: Option<String>,
}

/// A stored rule with its target location.
#[derive(Debug, Clone)]
pub struct AutoSortRule {
    pub record: AutoSortRuleRecord,
    pub target_location: LocationRecord,
}

/// `AutoSortRule.decode_list/1`: the strings of a JSON list column.
#[must_use]
pub fn decode_list(text: &str) -> Vec<String> {
    crate::catalog::json::strings(text)
}

/// Every stored rule by priority (`list_collection_auto_sort_rules/0`).
pub async fn list(pool: &SqlitePool) -> Result<Vec<AutoSortRule>, sqlx::Error> {
    let records = sqlx::query_as!(
        AutoSortRuleRecord,
        r#"SELECT id AS "id!", name AS "name!", enabled AS "enabled!: bool", priority AS "priority!",
                  target_location_id AS "target_location_id!", color_mode AS "color_mode!",
                  colors AS "colors!", type_line_includes AS "type_line_includes!",
                  type_line_excludes AS "type_line_excludes!", rarities AS "rarities!",
                  min_price_cents AS "min_price_cents?", max_price_cents AS "max_price_cents?",
                  set_operator AS "set_operator!", set_codes AS "set_codes!",
                  release_date_operator AS "release_date_operator!", release_date AS "release_date?"
           FROM collection_auto_sort_rules ORDER BY priority ASC, id ASC"#
    )
    .fetch_all(pool)
    .await?;
    with_targets(pool, records).await
}

async fn with_targets(
    pool: &SqlitePool,
    records: Vec<AutoSortRuleRecord>,
) -> Result<Vec<AutoSortRule>, sqlx::Error> {
    let ids: Vec<i64> = records.iter().map(|r| r.target_location_id).collect();
    let json = json_ids(&ids);
    let locations: HashMap<i64, LocationRecord> =
        location_query!("WHERE l.id IN (SELECT value FROM json_each(?1))", json)
            .fetch_all(pool)
            .await?
            .into_iter()
            .map(|location| (location.id, location))
            .collect();
    Ok(records
        .into_iter()
        .filter_map(|record| {
            let target_location = locations.get(&record.target_location_id)?.clone();
            Some(AutoSortRule {
                record,
                target_location,
            })
        })
        .collect())
}

/// A rule as entered (`CollectionAutoSortRuleInput`, location id decoded).
/// Missing values take the rule defaults.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct RuleInput {
    pub name: Option<String>,
    pub enabled: Option<bool>,
    pub priority: Option<i64>,
    pub target_location_id: Option<i64>,
    pub color_mode: Option<String>,
    pub colors: Option<Vec<String>>,
    pub type_line_includes: Option<Vec<String>>,
    pub type_line_excludes: Option<Vec<String>>,
    pub rarities: Option<Vec<String>>,
    pub min_price_cents: Option<i64>,
    pub max_price_cents: Option<i64>,
    pub set_operator: Option<String>,
    pub set_codes: Option<Vec<String>>,
    pub release_date_operator: Option<String>,
    pub release_date: Option<String>,
}

/// Why rules could not be saved or applied (`LocationMutations.auto_sort_error/1`).
#[derive(Debug, thiserror::Error)]
pub enum AutoSortError {
    #[error("Auto-sort source location was not found.")]
    SourceNotFound,
    #[error("Auto-sort target location was not found.")]
    TargetNotFound,
    #[error("Auto-sort target must be a box or binder.")]
    InvalidTarget,
    #[error("Auto-sort rule contains invalid criteria.")]
    InvalidRule,
    /// Changeset errors, already rendered.
    #[error("{0}")]
    Invalid(String),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

const COLOR_MODES: [&str; 6] = [
    "any",
    "include_any",
    "include_all",
    "exact",
    "colorless",
    "multicolor",
];

/// Parses `YYYY-MM-DD` (`Date.from_iso8601/1`).
#[must_use]
pub fn parse_date(value: &str) -> Option<time::Date> {
    time::Date::parse(
        value,
        time::macros::format_description!("[year]-[month]-[day]"),
    )
    .ok()
}

fn encode_list(values: Option<&Vec<String>>) -> String {
    serde_json::to_string(values.map_or(&[][..], Vec::as_slice)).unwrap_or_else(|_| "[]".to_owned())
}

struct ValidRule {
    name: String,
    enabled: bool,
    priority: i64,
    target_location_id: i64,
    color_mode: String,
    colors: String,
    type_line_includes: String,
    type_line_excludes: String,
    rarities: String,
    min_price_cents: Option<i64>,
    max_price_cents: Option<i64>,
    set_operator: String,
    set_codes: String,
    release_date_operator: String,
    release_date: Option<String>,
}

/// `AutoSortRule.changeset/2` over `ReplaceAutoSortRules.rule_attrs/1`.
fn validate(input: &RuleInput, target_location_id: i64) -> Result<ValidRule, FieldErrors> {
    let mut errors = FieldErrors::default();
    let name = input.name.clone().filter(|name| !name.is_empty());
    if name.as_deref().is_none_or(|name| name.trim().is_empty()) {
        errors.add("name", "can't be blank");
    }
    let color_mode = input
        .color_mode
        .clone()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "any".to_owned());
    let set_operator = input
        .set_operator
        .clone()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "in".to_owned());
    let release_date_operator = input
        .release_date_operator
        .clone()
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "after".to_owned());
    match input.priority {
        None => errors.add("priority", "can't be blank"),
        Some(priority) if priority < 0 => {
            errors.add("priority", "must be greater than or equal to 0");
        }
        Some(_) => {}
    }
    let release_date = match input.release_date.as_deref() {
        None | Some("") => None,
        Some(text) => {
            if parse_date(text).is_none() {
                errors.add("release_date", "is invalid");
            }
            parse_date(text).map(|_| text.to_owned())
        }
    };
    if !COLOR_MODES.contains(&color_mode.as_str()) {
        errors.add("color_mode", "is invalid");
    }
    if !["in", "not_in"].contains(&set_operator.as_str()) {
        errors.add("set_operator", "is invalid");
    }
    if !["before", "after"].contains(&release_date_operator.as_str()) {
        errors.add("release_date_operator", "is invalid");
    }
    for (field, value) in [
        ("min_price_cents", input.min_price_cents),
        ("max_price_cents", input.max_price_cents),
    ] {
        if value.is_some_and(|cents| cents < 0) {
            errors.add(field, "must be greater than or equal to 0");
        }
    }
    if let (Some(min), Some(max)) = (input.min_price_cents, input.max_price_cents)
        && min > max
    {
        errors.add(
            "max_price_cents",
            "must be greater than or equal to min price",
        );
    }
    errors.clone().into_result()?;
    Ok(ValidRule {
        name: name.unwrap_or_default(),
        enabled: input.enabled.unwrap_or(true),
        priority: input.priority.unwrap_or(0),
        target_location_id,
        color_mode,
        colors: encode_list(input.colors.as_ref()),
        type_line_includes: encode_list(input.type_line_includes.as_ref()),
        type_line_excludes: encode_list(input.type_line_excludes.as_ref()),
        rarities: encode_list(input.rarities.as_ref()),
        min_price_cents: input.min_price_cents,
        max_price_cents: input.max_price_cents,
        set_operator,
        set_codes: encode_list(input.set_codes.as_ref()),
        release_date_operator,
        release_date,
    })
}

/// Replaces every stored rule (`update_collection_auto_sort_rules/1`).
pub async fn replace(
    pool: &SqlitePool,
    inputs: &[RuleInput],
) -> Result<Vec<AutoSortRule>, AutoSortError> {
    let mut tx = crate::db::begin_write(pool).await?;
    sqlx::query!("DELETE FROM collection_auto_sort_rules")
        .execute(&mut *tx)
        .await?;
    let now = timefmt::now();
    let mut ids = Vec::with_capacity(inputs.len());
    for input in inputs {
        let target_id = input
            .target_location_id
            .ok_or(AutoSortError::TargetNotFound)?;
        let kind = sqlx::query_scalar!(
            r#"SELECT kind AS "kind!: LocationKind" FROM locations WHERE id = ?1"#,
            target_id
        )
        .fetch_optional(&mut *tx)
        .await?;
        match kind {
            None => return Err(AutoSortError::TargetNotFound),
            Some(kind) if !kind.is_auto_sort_target() => return Err(AutoSortError::InvalidTarget),
            Some(_) => {}
        }
        let rule = validate(input, target_id).map_err(|e| AutoSortError::Invalid(e.render()))?;
        let id = sqlx::query_scalar!(
            r#"INSERT INTO collection_auto_sort_rules
                 (name, enabled, priority, target_location_id, color_mode, colors,
                  type_line_includes, type_line_excludes, rarities, min_price_cents,
                  max_price_cents, set_operator, set_codes, release_date_operator, release_date,
                  inserted_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16)
               RETURNING id AS "id!""#,
            rule.name,
            rule.enabled,
            rule.priority,
            rule.target_location_id,
            rule.color_mode,
            rule.colors,
            rule.type_line_includes,
            rule.type_line_excludes,
            rule.rarities,
            rule.min_price_cents,
            rule.max_price_cents,
            rule.set_operator,
            rule.set_codes,
            rule.release_date_operator,
            rule.release_date,
            now
        )
        .fetch_one(&mut *tx)
        .await?;
        ids.push(id);
    }
    tx.commit().await?;
    let mut rules = list(pool).await?;
    // Returned in input order, like the inserted structs.
    rules.sort_by_key(|rule| ids.iter().position(|id| *id == rule.record.id));
    Ok(rules)
}

/// A rule as the matcher applies it (`AutoSort.Rules.rule_map/2`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SortRule {
    pub location_id: i64,
    pub location_name: String,
    pub color_mode: String,
    pub colors: Vec<String>,
    pub type_line_includes: Vec<String>,
    pub type_line_excludes: Vec<String>,
    pub rarities: Vec<String>,
    pub min_price_cents: Option<i64>,
    pub max_price_cents: Option<i64>,
    pub set_operator: String,
    pub set_codes: Vec<String>,
    pub release_date_operator: String,
    pub release_date: Option<time::Date>,
}

/// Enabled stored rules whose target is a box or binder, by priority
/// (`Query.enabled_rules/0`).
pub async fn enabled_rules(
    conn: &mut sqlx::SqliteConnection,
) -> Result<Vec<SortRule>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"SELECT l.id AS "location_id!", l.name AS "location_name!", r.color_mode AS "color_mode!",
                  r.colors AS "colors!", r.type_line_includes AS "type_line_includes!",
                  r.type_line_excludes AS "type_line_excludes!", r.rarities AS "rarities!",
                  r.min_price_cents AS "min_price_cents?", r.max_price_cents AS "max_price_cents?",
                  r.set_operator AS "set_operator!", r.set_codes AS "set_codes!",
                  r.release_date_operator AS "release_date_operator!", r.release_date AS "release_date?"
           FROM collection_auto_sort_rules AS r
           JOIN locations AS l ON l.id = r.target_location_id
           WHERE r.enabled = TRUE AND l.kind IN ('box', 'binder')
           ORDER BY r.priority ASC, r.id ASC"#
    )
    .fetch_all(&mut *conn)
    .await?;
    Ok(rows
        .into_iter()
        .map(|row| SortRule {
            location_id: row.location_id,
            location_name: row.location_name,
            color_mode: row.color_mode,
            colors: decode_list(&row.colors),
            type_line_includes: decode_list(&row.type_line_includes),
            type_line_excludes: decode_list(&row.type_line_excludes),
            rarities: decode_list(&row.rarities),
            min_price_cents: row.min_price_cents,
            max_price_cents: row.max_price_cents,
            set_operator: row.set_operator,
            set_codes: decode_list(&row.set_codes),
            release_date_operator: row.release_date_operator,
            release_date: row.release_date.as_deref().and_then(parse_date),
        })
        .collect())
}

/// Unsaved rules from a dry run (`Rules.input_rules/1`): enabled ones only,
/// by priority (input order breaking ties).
pub async fn input_rules(
    conn: &mut sqlx::SqliteConnection,
    inputs: &[RuleInput],
) -> Result<Vec<SortRule>, AutoSortError> {
    let mut enabled: Vec<(usize, &RuleInput)> = inputs
        .iter()
        .enumerate()
        .filter(|(_, rule)| rule.enabled == Some(true))
        .collect();
    enabled.sort_by_key(|(index, rule)| {
        (
            rule.priority
                .unwrap_or_else(|| i64::try_from(*index + 1).unwrap_or(i64::MAX)),
            *index,
        )
    });
    let mut normalized = Vec::with_capacity(enabled.len());
    for (_, rule) in &enabled {
        let location_id = rule
            .target_location_id
            .ok_or(AutoSortError::TargetNotFound)?;
        let release_date = match rule.release_date.as_deref() {
            None | Some("") => None,
            Some(text) => Some(parse_date(text).ok_or(AutoSortError::InvalidRule)?),
        };
        normalized.push((location_id, release_date, *rule));
    }
    let mut ids: Vec<i64> = normalized.iter().map(|(id, _, _)| *id).collect();
    ids.sort_unstable();
    ids.dedup();
    let json = json_ids(&ids);
    let locations: HashMap<i64, LocationRecord> = location_query!(
        "WHERE l.id IN (SELECT value FROM json_each(?1)) AND l.kind IN ('box', 'binder')",
        json
    )
    .fetch_all(&mut *conn)
    .await?
    .into_iter()
    .map(|location| (location.id, location))
    .collect();
    normalized
        .into_iter()
        .map(|(location_id, release_date, rule)| {
            let location = locations
                .get(&location_id)
                .ok_or(AutoSortError::TargetNotFound)?;
            let list = |values: &Option<Vec<String>>| values.clone().unwrap_or_default();
            Ok(SortRule {
                location_id,
                location_name: location.name.clone(),
                color_mode: rule.color_mode.clone().unwrap_or_else(|| "any".to_owned()),
                colors: list(&rule.colors),
                type_line_includes: list(&rule.type_line_includes),
                type_line_excludes: list(&rule.type_line_excludes),
                rarities: list(&rule.rarities),
                min_price_cents: rule.min_price_cents,
                max_price_cents: rule.max_price_cents,
                set_operator: rule.set_operator.clone().unwrap_or_else(|| "in".to_owned()),
                set_codes: list(&rule.set_codes),
                release_date_operator: rule
                    .release_date_operator
                    .clone()
                    .unwrap_or_else(|| "after".to_owned()),
                release_date,
            })
        })
        .collect()
}
