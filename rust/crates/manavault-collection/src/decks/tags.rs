//! Per-deck card tags and the global default tags new decks start with
//! (`Decks.Tags`, `Decks.DefaultTags`).

use std::collections::HashMap;

use sqlx::{SqliteConnection, SqlitePool};

use crate::decks::DeckError;
use crate::decks::model::{DeckCardId, DeckId, DeckTagRow, DefaultDeckTagRow, id_list};
use crate::decks::validation::{
    self, BLANK, Change, TAKEN, ValidationError, cast_string, greater_than, hex_color, length,
};
use manavault_core::db;
use manavault_core::timestamp::Timestamp;

/// The color of a tag created without one (`@default_color`).
pub const DEFAULT_COLOR: &str = "#7C5CFF";

/// A deck's tags by position, with the summed quantity of tagged cards.
pub async fn list_deck_tags(
    pool: &SqlitePool,
    deck_id: DeckId,
) -> Result<Vec<DeckTagRow>, sqlx::Error> {
    sqlx::query_as!(
        DeckTagRow,
        r#"SELECT t.id AS "id!", t.deck_id AS "deck_id!: DeckId", t.name AS "name!",
                  t.color AS "color!", t.target_count, t.position AS "position!",
                  COALESCE(SUM(dc.quantity), 0) AS "card_count!: i64"
           FROM deck_tags AS t
           LEFT JOIN deck_card_tags AS dct ON dct.deck_tag_id = t.id
           LEFT JOIN deck_cards AS dc ON dc.id = dct.deck_card_id
           WHERE t.deck_id = ?1
           GROUP BY t.id
           ORDER BY t.position ASC, t.id ASC"#,
        deck_id
    )
    .fetch_all(pool)
    .await
}

async fn load_tag(pool: &SqlitePool, id: i64) -> Result<Option<DeckTagRow>, sqlx::Error> {
    sqlx::query_as!(
        DeckTagRow,
        r#"SELECT t.id AS "id!", t.deck_id AS "deck_id!: DeckId", t.name AS "name!",
                  t.color AS "color!", t.target_count, t.position AS "position!",
                  (SELECT COALESCE(SUM(dc.quantity), 0) FROM deck_card_tags AS dct
                   JOIN deck_cards AS dc ON dc.id = dct.deck_card_id
                   WHERE dct.deck_tag_id = t.id) AS "card_count!: i64"
           FROM deck_tags AS t WHERE t.id = ?1"#,
        id
    )
    .fetch_optional(pool)
    .await
}

/// `DeckTagInput`, with `position` for the domain tests.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeckTagChanges {
    pub name: Change<String>,
    pub color: Change<String>,
    pub target_count: Change<i64>,
    pub position: Change<i64>,
}

struct TagValues {
    name: String,
    color: String,
    target_count: Option<i64>,
    position: i64,
}

fn validate_tag(
    current: Option<&TagValues>,
    changes: &DeckTagChanges,
    default_position: i64,
) -> Result<TagValues, ValidationError> {
    let mut errors = ValidationError::new();
    let name_change = cast_string(changes.name.clone());
    // A blank color, given or (on create) absent, falls back to the default.
    let color_change = match cast_string(changes.color.clone()) {
        Some(None) => Some(Some(DEFAULT_COLOR.to_owned())),
        None if current.is_none() => Some(Some(DEFAULT_COLOR.to_owned())),
        other => other,
    };
    let name = validation::apply(current.map(|tag| tag.name.clone()), &name_change);
    let color = validation::apply(current.map(|tag| tag.color.clone()), &color_change);
    let target_count = validation::apply(
        current.and_then(|tag| tag.target_count),
        &changes.target_count,
    );
    let position = validation::apply(
        Some(current.map_or(default_position, |tag| tag.position)),
        &changes.position,
    )
    .unwrap_or(0);
    if name.is_none() {
        errors.add("name", BLANK);
    }
    if color.is_none() {
        errors.add("color", BLANK);
    }
    if let Some(Some(name)) = &name_change {
        length(&mut errors, "name", Some(name), 1, 60);
    }
    if let Some(Some(color)) = &color_change {
        hex_color(&mut errors, "color", Some(color));
    }
    if let Some(Some(count)) = changes.target_count {
        greater_than(&mut errors, "target_count", Some(count), 0);
    }
    match (name, color) {
        (Some(name), Some(color)) if errors.is_empty() => Ok(TagValues {
            name,
            color,
            target_count,
            position,
        }),
        _ => Err(errors),
    }
}

fn unique_error(error: sqlx::Error, field: &'static str) -> DeckError {
    if validation::is_unique_violation(&error) {
        DeckError::Invalid(validation::error(field, TAKEN))
    } else {
        DeckError::Db(error)
    }
}

/// `Decks.create_deck_tag/2`: new tags go after the last position.
pub async fn create_deck_tag(
    pool: &SqlitePool,
    deck_id: DeckId,
    changes: &DeckTagChanges,
) -> Result<DeckTagRow, DeckError> {
    let next: Option<i64> = sqlx::query_scalar!(
        r#"SELECT MAX(position) AS "max?: i64" FROM deck_tags WHERE deck_id = ?1"#,
        deck_id
    )
    .fetch_one(pool)
    .await?;
    let values = validate_tag(None, changes, next.map_or(0, |max| max + 1))?;
    let now = Timestamp::now();
    let id = sqlx::query_scalar!(
        r#"INSERT INTO deck_tags (deck_id, name, color, target_count, position, inserted_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6) RETURNING id AS "id!""#,
        deck_id,
        values.name,
        values.color,
        values.target_count,
        values.position,
        now
    )
    .fetch_one(pool)
    .await
    .map_err(|error| unique_error(error, "deck_id"))?;
    load_tag(pool, id).await?.ok_or(DeckError::NotFound)
}

/// Loads a tag or fails with `:not_found`.
pub async fn get_deck_tag(pool: &SqlitePool, id: i64) -> Result<DeckTagRow, DeckError> {
    load_tag(pool, id).await?.ok_or(DeckError::NotFound)
}

/// `Decks.update_deck_tag/2`.
pub async fn update_deck_tag(
    pool: &SqlitePool,
    id: i64,
    changes: &DeckTagChanges,
) -> Result<DeckTagRow, DeckError> {
    let tag = get_deck_tag(pool, id).await?;
    let current = TagValues {
        name: tag.name.clone(),
        color: tag.color.clone(),
        target_count: tag.target_count,
        position: tag.position,
    };
    let values = validate_tag(Some(&current), changes, tag.position)?;
    let now = Timestamp::now();
    sqlx::query!(
        "UPDATE deck_tags SET name = ?2, color = ?3, target_count = ?4, position = ?5, updated_at = ?6 WHERE id = ?1",
        id,
        values.name,
        values.color,
        values.target_count,
        values.position,
        now
    )
    .execute(pool)
    .await
    .map_err(|error| unique_error(error, "deck_id"))?;
    get_deck_tag(pool, id).await
}

/// `Decks.delete_deck_tag/1`; card assignments cascade.
pub async fn delete_deck_tag(pool: &SqlitePool, id: i64) -> Result<DeckTagRow, DeckError> {
    let tag = get_deck_tag(pool, id).await?;
    sqlx::query!("DELETE FROM deck_tags WHERE id = ?1", id)
        .execute(pool)
        .await?;
    Ok(tag)
}

/// `Decks.reorder_deck_tags/2`: positions follow the given order; ids of
/// other decks' tags are ignored.
pub async fn reorder_deck_tags(
    pool: &SqlitePool,
    deck_id: DeckId,
    ordered: &[i64],
) -> Result<Vec<DeckTagRow>, DeckError> {
    let mut tx = db::begin_write(pool).await?;
    let owned: Vec<i64> = sqlx::query_scalar!(
        r#"SELECT id AS "id!" FROM deck_tags WHERE deck_id = ?1"#,
        deck_id
    )
    .fetch_all(&mut *tx)
    .await?;
    for (index, id) in ordered.iter().filter(|id| owned.contains(id)).enumerate() {
        let position = i64::try_from(index).unwrap_or(i64::MAX);
        sqlx::query!(
            "UPDATE deck_tags SET position = ?2 WHERE id = ?1",
            id,
            position
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(list_deck_tags(pool, deck_id).await?)
}

/// `Decks.assign_deck_card_tag/2`: idempotent; the tag must belong to the
/// card's deck. Returns the card's deck id.
pub async fn assign_deck_card_tag(
    pool: &SqlitePool,
    deck_card_id: DeckCardId,
    tag_id: i64,
) -> Result<DeckId, DeckError> {
    let card_deck: Option<DeckId> = sqlx::query_scalar!(
        r#"SELECT deck_id AS "deck_id!: DeckId" FROM deck_cards WHERE id = ?1"#,
        deck_card_id
    )
    .fetch_optional(pool)
    .await?;
    let tag_deck: Option<DeckId> = sqlx::query_scalar!(
        r#"SELECT deck_id AS "deck_id!: DeckId" FROM deck_tags WHERE id = ?1"#,
        tag_id
    )
    .fetch_optional(pool)
    .await?;
    let (Some(card_deck), Some(tag_deck)) = (card_deck, tag_deck) else {
        return Err(DeckError::NotFound);
    };
    if card_deck != tag_deck {
        return Err(DeckError::Code("deck_mismatch"));
    }
    let now = Timestamp::now();
    sqlx::query!(
        r#"INSERT INTO deck_card_tags (deck_card_id, deck_tag_id, deck_id, inserted_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?4)
           ON CONFLICT (deck_card_id, deck_tag_id) DO NOTHING"#,
        deck_card_id,
        tag_id,
        card_deck,
        now
    )
    .execute(pool)
    .await?;
    Ok(card_deck)
}

/// `Decks.unassign_deck_card_tag/2`: idempotent. Returns the card's deck id.
pub async fn unassign_deck_card_tag(
    pool: &SqlitePool,
    deck_card_id: DeckCardId,
    tag_id: i64,
) -> Result<DeckId, DeckError> {
    let card_deck: Option<DeckId> = sqlx::query_scalar!(
        r#"SELECT deck_id AS "deck_id!: DeckId" FROM deck_cards WHERE id = ?1"#,
        deck_card_id
    )
    .fetch_optional(pool)
    .await?;
    let card_deck = card_deck.ok_or(DeckError::NotFound)?;
    sqlx::query!(
        "DELETE FROM deck_card_tags WHERE deck_card_id = ?1 AND deck_tag_id = ?2",
        deck_card_id,
        tag_id
    )
    .execute(pool)
    .await?;
    Ok(card_deck)
}

/// Tag ids per deck card (`Decks.put_deck_card_tag_ids/1`).
pub async fn tag_ids_by_deck_card(
    pool: &SqlitePool,
    deck_card_ids: &[DeckCardId],
) -> Result<HashMap<DeckCardId, Vec<i64>>, sqlx::Error> {
    if deck_card_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = id_list(deck_card_ids.iter().map(|id| id.0));
    let rows = sqlx::query!(
        r#"SELECT deck_card_id AS "deck_card_id!: DeckCardId", deck_tag_id AS "deck_tag_id!"
           FROM deck_card_tags WHERE deck_card_id IN (SELECT value FROM json_each(?1))
           ORDER BY id"#,
        ids
    )
    .fetch_all(pool)
    .await?;
    let mut grouped: HashMap<DeckCardId, Vec<i64>> = HashMap::new();
    for row in rows {
        grouped
            .entry(row.deck_card_id)
            .or_default()
            .push(row.deck_tag_id);
    }
    Ok(grouped)
}

/// The global default tags by position.
pub async fn list_default_deck_tags(
    pool: &SqlitePool,
) -> Result<Vec<DefaultDeckTagRow>, sqlx::Error> {
    sqlx::query_as!(
        DefaultDeckTagRow,
        r#"SELECT id AS "id!", name AS "name!", color AS "color!", target_count,
                  position AS "position!"
           FROM default_deck_tags ORDER BY position ASC, id ASC"#
    )
    .fetch_all(pool)
    .await
}

/// A `DefaultDeckTagInput`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DefaultTagEntry {
    pub name: String,
    pub color: String,
    pub target_count: Option<i64>,
}

/// `Decks.replace_default_deck_tags/1`: positions follow the list order.
pub async fn replace_default_deck_tags(
    pool: &SqlitePool,
    entries: &[DefaultTagEntry],
) -> Result<Vec<DefaultDeckTagRow>, DeckError> {
    let mut tx = db::begin_write(pool).await?;
    sqlx::query!("DELETE FROM default_deck_tags")
        .execute(&mut *tx)
        .await?;
    let now = Timestamp::now();
    for (index, entry) in entries.iter().enumerate() {
        let changes = DeckTagChanges {
            name: Some(Some(entry.name.clone())),
            color: Some(Some(entry.color.clone())),
            target_count: Some(entry.target_count),
            position: None,
        };
        // DefaultDeckTag.changeset requires a color instead of defaulting it.
        if entry.color.trim().is_empty() {
            let mut errors = ValidationError::new();
            if entry.name.trim().is_empty() {
                errors.add("name", BLANK);
            }
            errors.add("color", BLANK);
            return Err(errors.into());
        }
        let position = i64::try_from(index).unwrap_or(i64::MAX);
        let values = validate_tag(None, &changes, position)?;
        sqlx::query!(
            r#"INSERT INTO default_deck_tags (name, color, target_count, position, inserted_at, updated_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?5)"#,
            values.name,
            values.color,
            values.target_count,
            position,
            now
        )
        .execute(&mut *tx)
        .await
        .map_err(|error| unique_error(error, "name"))?;
    }
    tx.commit().await?;
    Ok(list_default_deck_tags(pool).await?)
}

/// `Decks.seed_deck_default_tags/1`: copies the default tags into a new deck.
pub async fn seed_deck_default_tags(
    conn: &mut SqliteConnection,
    deck_id: DeckId,
) -> Result<(), sqlx::Error> {
    let now = Timestamp::now();
    sqlx::query!(
        r#"INSERT INTO deck_tags (deck_id, name, color, target_count, position, inserted_at, updated_at)
           SELECT ?1, name, color, target_count, position, ?2, ?2
           FROM default_deck_tags ORDER BY position ASC, id ASC"#,
        deck_id,
        now
    )
    .execute(conn)
    .await?;
    Ok(())
}
