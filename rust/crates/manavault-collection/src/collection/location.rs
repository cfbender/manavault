//! Storage locations (`Manavault.Catalog.Location`, `Collection.Locations`).
//!
//! Items without a location live in the virtual "unfiled" bucket, exposed to
//! GraphQL as the location `Location:unfiled`. A `list` location (wishlist,
//! want list, ...) holds cards that are not part of the collection proper:
//! collection listings, totals, and auto-sort skip list items unless asked
//! for that list, and deleting a list deletes its items.

use std::collections::HashMap;
use std::sync::Arc;

use async_graphql::MaybeUndefined;
use lotus::ScryfallId;
use serde::{Deserialize, Serialize};
use sqlx::{SqliteConnection, SqlitePool};

use crate::collection::queries::ValueTotals;
use crate::timefmt;
use crate::validation::{INVALID, ValidationError};

/// What a location is (`@kinds`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(rename_all = "snake_case")]
pub enum LocationKind {
    Box,
    Binder,
    DeckBox,
    List,
    Folder,
    Other,
}

impl LocationKind {
    /// The stored text value.
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Box => "box",
            Self::Binder => "binder",
            Self::DeckBox => "deck_box",
            Self::List => "list",
            Self::Folder => "folder",
            Self::Other => "other",
        }
    }

    /// Parses a stored text value.
    #[must_use]
    pub fn parse(value: &str) -> Option<Self> {
        Some(match value {
            "box" => Self::Box,
            "binder" => Self::Binder,
            "deck_box" => Self::DeckBox,
            "list" => Self::List,
            "folder" => Self::Folder,
            "other" => Self::Other,
            _ => return None,
        })
    }

    /// Boxes and binders are storage that auto-sort can file cards into.
    #[must_use]
    pub fn is_auto_sort_target(self) -> bool {
        matches!(self, Self::Box | Self::Binder)
    }
}

/// A `locations` row.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocationRecord {
    pub id: i64,
    pub name: String,
    pub kind: LocationKind,
    pub description: Option<String>,
    pub cover_scryfall_id: Option<ScryfallId>,
    pub inserted_at: String,
    pub updated_at: String,
}

/// Selects `locations` rows aliased `l` into [`LocationRecord`]; the
/// argument is the rest of the query after `FROM locations AS l`.
#[macro_export]
macro_rules! location_query {
    ($tail:literal $(, $arg:expr)* $(,)?) => {
        sqlx::query_as!(
            $crate::collection::location::LocationRecord,
            r#"SELECT l.id AS "id!", l.name AS "name!",
                 l.kind AS "kind!: crate::collection::location::LocationKind",
                 l.description AS "description?",
                 l.cover_scryfall_id AS "cover_scryfall_id?: lotus::ScryfallId",
                 l.inserted_at AS "inserted_at!", l.updated_at AS "updated_at!"
               FROM locations AS l "# + $tail
            $(, $arg)*
        )
    };
}

/// Where a GraphQL `Location` points: a stored location or the virtual
/// unfiled bucket.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Place {
    Unfiled,
    Stored(Arc<LocationRecord>),
}

/// The GraphQL `Location`: a place and, when already computed, the value
/// summary of its unallocated items (`Location`'s virtual summary fields).
#[derive(Debug, Clone)]
pub struct Location {
    pub place: Place,
    pub totals: Option<ValueTotals>,
}

impl Location {
    /// A stored location whose summary loads on demand.
    #[must_use]
    pub fn stored(record: impl Into<Arc<LocationRecord>>) -> Self {
        Self {
            place: Place::Stored(record.into()),
            totals: None,
        }
    }

    /// The unfiled bucket with its summary.
    #[must_use]
    pub fn unfiled(totals: ValueTotals) -> Self {
        Self {
            place: Place::Unfiled,
            totals: Some(totals),
        }
    }

    /// The stored row, unless this is the unfiled bucket.
    #[must_use]
    pub fn record(&self) -> Option<&LocationRecord> {
        match &self.place {
            Place::Stored(record) => Some(record),
            Place::Unfiled => None,
        }
    }

    /// One location row (`Collection.get_location!/1` without the raise).
    pub async fn load(pool: &SqlitePool, id: i64) -> Result<Option<LocationRecord>, sqlx::Error> {
        location_query!("WHERE l.id = ?1", id)
            .fetch_optional(pool)
            .await
    }

    /// Location rows by id, keyed by id.
    pub async fn load_many(
        conn: &mut SqliteConnection,
        ids: &[i64],
    ) -> Result<HashMap<i64, LocationRecord>, sqlx::Error> {
        if ids.is_empty() {
            return Ok(HashMap::new());
        }
        let ids = json_ids(ids);
        Ok(
            location_query!("WHERE l.id IN (SELECT value FROM json_each(?1))", ids)
                .fetch_all(&mut *conn)
                .await?
                .into_iter()
                .map(|record| (record.id, record))
                .collect(),
        )
    }
}

/// A JSON array of integer ids, for `IN (SELECT value FROM json_each(?))`.
#[must_use]
pub fn json_ids(ids: &[i64]) -> String {
    serde_json::to_string(ids).unwrap_or_else(|_| "[]".to_owned())
}

/// Every location by name (`Locations.list/1`).
pub async fn list(pool: &SqlitePool) -> Result<Vec<LocationRecord>, sqlx::Error> {
    location_query!("ORDER BY l.name ASC").fetch_all(pool).await
}

/// How many locations exist (`count_locations/0`).
pub async fn count(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(r#"SELECT count(*) AS "count!: i64" FROM locations"#)
        .fetch_one(pool)
        .await
}

/// Location fields to write (`LocationInput` / `LocationUpdateInput`).
/// Absent fields keep their value; `null` clears.
#[derive(Debug, Clone, Default)]
pub struct LocationChanges {
    pub name: MaybeUndefined<String>,
    pub kind: MaybeUndefined<String>,
    pub description: MaybeUndefined<String>,
    pub cover_scryfall_id: MaybeUndefined<String>,
}

/// Why a location write failed.
#[derive(Debug, thiserror::Error)]
pub enum LocationError {
    /// `Errors.not_found_error(:location)`.
    #[error("Location was not found.")]
    NotFound,
    /// Validation errors.
    #[error(transparent)]
    Invalid(#[from] ValidationError),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Casts a text field: `""` clears it, like `null`.
fn cast_text(value: MaybeUndefined<String>, current: Option<String>) -> Option<String> {
    match value {
        MaybeUndefined::Undefined => current,
        MaybeUndefined::Null => None,
        MaybeUndefined::Value(text) if text.is_empty() => None,
        MaybeUndefined::Value(text) => Some(text),
    }
}

struct ValidLocation {
    name: String,
    kind: LocationKind,
    description: Option<String>,
    cover_scryfall_id: Option<String>,
}

/// `Location.changeset/2`.
///
/// Earlier releases raised on a missing cover printing (SQLite foreign key
/// errors carry no constraint name); here it is a validation error on the
/// field.
async fn validate(
    conn: &mut SqliteConnection,
    current: Option<&LocationRecord>,
    changes: LocationChanges,
) -> Result<ValidLocation, LocationError> {
    let kind_changed = !changes.kind.is_undefined();
    let cover_changed = !changes.cover_scryfall_id.is_undefined();
    let name = cast_text(changes.name, current.map(|c| c.name.clone()));
    let kind = cast_text(
        changes.kind,
        Some(current.map_or("box", |c| c.kind.as_str()).to_owned()),
    );
    let description = cast_text(
        changes.description,
        current.and_then(|c| c.description.clone()),
    );
    let cover = cast_text(
        changes.cover_scryfall_id,
        current.and_then(|c| c.cover_scryfall_id.as_ref().map(ToString::to_string)),
    );

    let mut errors = ValidationError::new();
    if name.as_deref().is_none_or(|n| n.trim().is_empty()) {
        errors.add("name", "can't be blank");
    }
    let parsed_kind = match kind.as_deref() {
        None => {
            errors.add("kind", "can't be blank");
            None
        }
        Some(text) if text.trim().is_empty() => {
            errors.add("kind", "can't be blank");
            None
        }
        Some(text) => {
            let parsed = LocationKind::parse(text);
            if parsed.is_none() && kind_changed {
                errors.add("kind", "is invalid");
            }
            parsed
        }
    };
    if cover_changed && let Some(cover) = cover.as_deref() {
        let exists = sqlx::query_scalar!(
            r#"SELECT count(*) AS "count!: i64" FROM scryfall_printings WHERE scryfall_id = ?1"#,
            cover
        )
        .fetch_one(&mut *conn)
        .await?;
        if exists == 0 {
            errors.add("cover_scryfall_id", "does not exist");
        }
    }
    errors.into_result()?;
    match (name, parsed_kind) {
        (Some(name), Some(kind)) => Ok(ValidLocation {
            name,
            kind,
            description,
            cover_scryfall_id: cover,
        }),
        _ => Err(LocationError::Invalid(ValidationError::single(
            "kind", INVALID,
        ))),
    }
}

fn unique_name(error: sqlx::Error) -> LocationError {
    match &error {
        sqlx::Error::Database(db) if db.is_unique_violation() => {
            LocationError::Invalid(ValidationError::single("name", "has already been taken"))
        }
        _ => LocationError::Db(error),
    }
}

/// Creates a location (`create_location/1`).
pub async fn create(
    pool: &SqlitePool,
    changes: LocationChanges,
) -> Result<LocationRecord, LocationError> {
    let mut conn = pool.acquire().await?;
    let valid = validate(&mut conn, None, changes).await?;
    let now = timefmt::now();
    let id = sqlx::query_scalar!(
        r#"INSERT INTO locations (name, kind, description, cover_scryfall_id, inserted_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?5) RETURNING id AS "id!""#,
        valid.name,
        valid.kind,
        valid.description,
        valid.cover_scryfall_id,
        now
    )
    .fetch_one(&mut *conn)
    .await
    .map_err(unique_name)?;
    location_query!("WHERE l.id = ?1", id)
        .fetch_one(&mut *conn)
        .await
        .map_err(LocationError::from)
}

/// Updates a location (`update_location/2`).
pub async fn update(
    pool: &SqlitePool,
    id: i64,
    changes: LocationChanges,
) -> Result<LocationRecord, LocationError> {
    let mut conn = pool.acquire().await?;
    let current = location_query!("WHERE l.id = ?1", id)
        .fetch_optional(&mut *conn)
        .await?
        .ok_or(LocationError::NotFound)?;
    let valid = validate(&mut conn, Some(&current), changes).await?;
    let unchanged = valid.name == current.name
        && valid.kind == current.kind
        && valid.description == current.description
        && valid.cover_scryfall_id.as_deref()
            == current.cover_scryfall_id.as_ref().map(ScryfallId::as_str);
    if !unchanged {
        let now = timefmt::now();
        sqlx::query!(
            "UPDATE locations SET name = ?1, kind = ?2, description = ?3, cover_scryfall_id = ?4, updated_at = ?5 WHERE id = ?6",
            valid.name,
            valid.kind,
            valid.description,
            valid.cover_scryfall_id,
            now,
            id
        )
        .execute(&mut *conn)
        .await
        .map_err(unique_name)?;
    }
    location_query!("WHERE l.id = ?1", id)
        .fetch_one(&mut *conn)
        .await
        .map_err(LocationError::from)
}

/// Deletes a location (`delete_location/1`). Items in a storage location are
/// unfiled (the foreign key sets them `NULL`); a list's items are deleted
/// with it.
pub async fn delete(pool: &SqlitePool, id: i64) -> Result<LocationRecord, LocationError> {
    let mut tx = crate::db::begin_write(pool).await?;
    let location = location_query!("WHERE l.id = ?1", id)
        .fetch_optional(&mut *tx)
        .await?
        .ok_or(LocationError::NotFound)?;
    if location.kind == LocationKind::List {
        sqlx::query!("DELETE FROM collection_items WHERE location_id = ?1", id)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query!("DELETE FROM locations WHERE id = ?1", id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(location)
}

/// Whether a location can be an auto-sort target
/// (`Locations.validate_auto_sort_target/1`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AutoSortTarget {
    Valid,
    NotStorage,
    NotFound,
}

pub async fn auto_sort_target(pool: &SqlitePool, id: i64) -> Result<AutoSortTarget, sqlx::Error> {
    let kind = sqlx::query_scalar!(
        r#"SELECT kind AS "kind!: LocationKind" FROM locations WHERE id = ?1"#,
        id
    )
    .fetch_optional(pool)
    .await?;
    Ok(match kind {
        None => AutoSortTarget::NotFound,
        Some(kind) if kind.is_auto_sort_target() => AutoSortTarget::Valid,
        Some(_) => AutoSortTarget::NotStorage,
    })
}
