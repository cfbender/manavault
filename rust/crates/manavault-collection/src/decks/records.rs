//! Creating, updating, sharing, and deleting decks (`Decks.Records`,
//! `Decks.Queries`, `Decks.DeckPicker.record_outcome/2`).

use sqlx::SqlitePool;

use crate::db;
use crate::decks::model::{
    DeckCardId, DeckFormat, DeckId, DeckRow, DeckStatus, load_deck, load_deck_on,
};
use crate::decks::validation::{
    self, BLANK, Change, Errors, INVALID, apply, at_least, cast_string, length, too_long,
};
use crate::decks::{DeckError, share_token, tags};
use crate::timefmt;

/// Deck attributes from `DeckInput` / `DeckUpdateInput` (`Deck.changeset/2`).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct DeckChanges {
    pub name: Change<String>,
    pub format: Change<String>,
    pub status: Change<String>,
    pub included_for_play: Change<bool>,
    pub play_count: Change<i64>,
    pub skip_count: Change<i64>,
    pub last_played_at: Change<String>,
    pub primer: Change<String>,
    pub cover_deck_card_id: Change<DeckCardId>,
}

/// A deck's editable fields after a valid changeset.
#[derive(Debug, Clone, PartialEq, Eq)]
struct DeckValues {
    name: String,
    format: DeckFormat,
    status: DeckStatus,
    included_for_play: bool,
    play_count: i64,
    skip_count: i64,
    last_played_at: Option<String>,
    primer: Option<String>,
    cover_deck_card_id: Option<DeckCardId>,
}

fn validate(current: Option<&DeckRow>, changes: &DeckChanges) -> Result<DeckValues, Errors> {
    let mut errors = Errors::new();
    let name_change = cast_string(changes.name.clone());
    let format_change = cast_string(changes.format.clone());
    let status_change = cast_string(changes.status.clone());
    let primer_change = cast_string(changes.primer.clone());
    let played_change = cast_string(changes.last_played_at.clone());

    let name = apply(current.map(|deck| deck.name.clone()), &name_change);
    let format_text = apply(
        Some(
            current
                .map_or(DeckFormat::Commander, |deck| deck.format)
                .as_str()
                .to_owned(),
        ),
        &format_change,
    );
    let status_text = apply(
        Some(
            current
                .map_or(DeckStatus::Brewing, |deck| deck.status)
                .as_str()
                .to_owned(),
        ),
        &status_change,
    );
    let included_for_play = apply(
        Some(current.is_none_or(|deck| deck.included_for_play)),
        &changes.included_for_play,
    );
    let play_count = apply(
        Some(current.map_or(0, |deck| deck.play_count)),
        &changes.play_count,
    );
    let skip_count = apply(
        Some(current.map_or(0, |deck| deck.skip_count)),
        &changes.skip_count,
    );
    let primer = apply(current.and_then(|deck| deck.primer.clone()), &primer_change);
    let cover_deck_card_id = apply(
        current.and_then(|deck| deck.cover_deck_card_id),
        &changes.cover_deck_card_id,
    );
    let last_played_at = match &played_change {
        None => current.and_then(|deck| deck.last_played_at.clone()),
        Some(None) => None,
        Some(Some(text)) => {
            let parsed = timefmt::parse(text).map(timefmt::utc_seconds);
            if parsed.is_none() {
                errors.add("last_played_at", INVALID);
            }
            parsed
        }
    };

    // validate_required
    if name.is_none() {
        errors.add("name", BLANK);
    }
    if format_text.is_none() {
        errors.add("format", BLANK);
    }
    if status_text.is_none() {
        errors.add("status", BLANK);
    }
    if included_for_play.is_none() {
        errors.add("included_for_play", BLANK);
    }
    // Validations of changed values.
    if let Some(Some(name)) = &name_change {
        length(&mut errors, "name", Some(name), 1, 120);
    }
    if let Some(Some(primer)) = &primer_change
        && primer.chars().count() > 50_000
    {
        errors.add("primer", too_long(50_000));
    }
    if let Some(Some(count)) = changes.play_count {
        at_least(&mut errors, "play_count", Some(count), 0);
    }
    if let Some(Some(count)) = changes.skip_count {
        at_least(&mut errors, "skip_count", Some(count), 0);
    }
    let format = format_text.as_deref().and_then(DeckFormat::parse);
    if format_text.is_some() && format.is_none() {
        errors.add("format", INVALID);
    }
    let status = status_text.as_deref().and_then(DeckStatus::parse);
    if status_text.is_some() && status.is_none() {
        errors.add("status", INVALID);
    }

    match (name, format, status, included_for_play) {
        (Some(name), Some(format), Some(status), Some(included_for_play)) if errors.is_empty() => {
            Ok(DeckValues {
                name,
                format,
                status,
                included_for_play,
                play_count: play_count.unwrap_or(0),
                skip_count: skip_count.unwrap_or(0),
                last_played_at,
                primer,
                cover_deck_card_id,
            })
        }
        _ => Err(errors),
    }
}

/// Loads a deck or fails with [`DeckError::DeckNotFound`].
pub async fn get_deck(pool: &SqlitePool, id: DeckId) -> Result<DeckRow, DeckError> {
    load_deck(pool, id).await?.ok_or(DeckError::DeckNotFound)
}

/// `Decks.create_deck/1`: inserts the deck and copies the default tags.
pub async fn create_deck(pool: &SqlitePool, changes: &DeckChanges) -> Result<DeckRow, DeckError> {
    let values = validate(None, changes)?;
    let mut tx = db::begin_write(pool).await?;
    let now = timefmt::now();
    let id = sqlx::query_scalar!(
        r#"INSERT INTO decks (name, format, status, included_for_play, play_count, skip_count,
                              last_played_at, primer, cover_deck_card_id, inserted_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
           RETURNING id AS "id!: DeckId""#,
        values.name,
        values.format,
        values.status,
        values.included_for_play,
        values.play_count,
        values.skip_count,
        values.last_played_at,
        values.primer,
        values.cover_deck_card_id,
        now
    )
    .fetch_one(&mut *tx)
    .await?;
    tags::seed_deck_default_tags(&mut tx, id).await?;
    let deck = load_deck_on(&mut tx, id)
        .await?
        .ok_or(DeckError::DeckNotFound)?;
    tx.commit().await?;
    Ok(deck)
}

/// `Decks.update_deck/2`. A cover card must belong to the deck.
pub async fn update_deck(
    pool: &SqlitePool,
    id: DeckId,
    changes: &DeckChanges,
) -> Result<DeckRow, DeckError> {
    let deck = get_deck(pool, id).await?;
    let values = validate(Some(&deck), changes)?;
    if let Some(Some(cover)) = changes.cover_deck_card_id {
        let owner: Option<DeckId> = sqlx::query_scalar!(
            r#"SELECT deck_id AS "deck_id!: DeckId" FROM deck_cards WHERE id = ?1"#,
            cover
        )
        .fetch_optional(pool)
        .await?;
        if owner != Some(deck.id) {
            return Err(validation::error("cover_deck_card_id", "must belong to deck").into());
        }
    }
    let now = timefmt::now();
    sqlx::query!(
        r#"UPDATE decks SET name = ?2, format = ?3, status = ?4, included_for_play = ?5,
                 play_count = ?6, skip_count = ?7, last_played_at = ?8, primer = ?9,
                 cover_deck_card_id = ?10, updated_at = ?11
           WHERE id = ?1"#,
        deck.id,
        values.name,
        values.format,
        values.status,
        values.included_for_play,
        values.play_count,
        values.skip_count,
        values.last_played_at,
        values.primer,
        values.cover_deck_card_id,
        now
    )
    .execute(pool)
    .await?;
    get_deck(pool, id).await
}

/// `Decks.delete_deck/1`: returns every allocated copy to its source
/// location, then deletes the deck. Archived decks can be deleted.
pub async fn delete_deck(pool: &SqlitePool, id: DeckId) -> Result<DeckRow, DeckError> {
    let mut tx = db::begin_write(pool).await?;
    let deck = load_deck_on(&mut tx, id)
        .await?
        .ok_or(DeckError::DeckNotFound)?;
    for row in crate::decks::model::deck_card_rows(&mut tx, id).await? {
        manavault_allocation::clear_deck_card_allocations(&mut tx, row.id).await?;
        sqlx::query!("DELETE FROM deck_cards WHERE id = ?1", row.id)
            .execute(&mut *tx)
            .await?;
    }
    sqlx::query!("DELETE FROM decks WHERE id = ?1", id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(deck)
}

const SHARE_TOKEN_ATTEMPTS: usize = 5;

async fn put_share_token(pool: &SqlitePool, id: DeckId) -> Result<DeckRow, DeckError> {
    for _ in 0..SHARE_TOKEN_ATTEMPTS {
        let token = share_token::generate();
        let now = timefmt::now();
        match sqlx::query!(
            "UPDATE decks SET share_token = ?2, updated_at = ?3 WHERE id = ?1",
            id,
            token,
            now
        )
        .execute(pool)
        .await
        {
            Ok(_) => return get_deck(pool, id).await,
            Err(error) if validation::is_unique_violation(&error) => {}
            Err(error) => return Err(error.into()),
        }
    }
    Err(DeckError::Code("share_token_collision"))
}

/// `Decks.ensure_deck_share_token/1`: keeps an existing token.
pub async fn ensure_share_token(pool: &SqlitePool, id: DeckId) -> Result<DeckRow, DeckError> {
    let deck = get_deck(pool, id).await?;
    if deck
        .share_token
        .as_deref()
        .is_some_and(|token| !token.is_empty())
    {
        return Ok(deck);
    }
    put_share_token(pool, id).await
}

/// `Decks.rotate_deck_share_token/1`: replaces the token, so old links stop
/// working.
pub async fn rotate_share_token(pool: &SqlitePool, id: DeckId) -> Result<DeckRow, DeckError> {
    get_deck(pool, id).await?;
    put_share_token(pool, id).await
}

/// `Decks.disable_deck_sharing/1`.
pub async fn disable_sharing(pool: &SqlitePool, id: DeckId) -> Result<DeckRow, DeckError> {
    get_deck(pool, id).await?;
    let now = timefmt::now();
    sqlx::query!(
        "UPDATE decks SET share_token = NULL, updated_at = ?2 WHERE id = ?1",
        id,
        now
    )
    .execute(pool)
    .await?;
    get_deck(pool, id).await
}

/// `Decks.get_deck_by_share_token/2`: malformed tokens never query.
pub async fn get_by_share_token(
    pool: &SqlitePool,
    token: &str,
) -> Result<Option<DeckRow>, sqlx::Error> {
    if !share_token::is_valid(token) {
        return Ok(None);
    }
    crate::deck_row_query!("WHERE d.share_token = ?1", token)
        .fetch_optional(pool)
        .await
}

/// `DeckPlayOutcome`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlayOutcome {
    Played,
    Skipped,
}

/// `DeckPicker.record_outcome/2`: playing resets accumulated skips.
pub async fn record_play(
    pool: &SqlitePool,
    id: DeckId,
    outcome: PlayOutcome,
) -> Result<DeckRow, DeckError> {
    let deck = get_deck(pool, id).await?;
    if deck.status == DeckStatus::Archived {
        return Err(DeckError::Code("archived_deck"));
    }
    let now = timefmt::now();
    match outcome {
        PlayOutcome::Played => {
            sqlx::query!(
                "UPDATE decks SET play_count = play_count + 1, skip_count = 0, last_played_at = ?2, updated_at = ?2 WHERE id = ?1",
                id,
                now
            )
            .execute(pool)
            .await?;
        }
        PlayOutcome::Skipped => {
            sqlx::query!(
                "UPDATE decks SET skip_count = skip_count + 1, updated_at = ?2 WHERE id = ?1",
                id,
                now
            )
            .execute(pool)
            .await?;
        }
    }
    get_deck(pool, id).await
}

/// `Decks.count_decks/0`.
pub async fn count_decks(pool: &SqlitePool) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(r#"SELECT COUNT(*) AS "count!: i64" FROM decks"#)
        .fetch_one(pool)
        .await
}

/// A page of decks by name (`Decks.list_deck_summaries/1` without the
/// summaries, which [`crate::decks::contents`] adds).
pub async fn list_decks(
    pool: &SqlitePool,
    offset: i64,
    limit: i64,
) -> Result<Vec<DeckRow>, sqlx::Error> {
    crate::deck_row_query!(
        "ORDER BY d.name ASC, d.id ASC LIMIT ?1 OFFSET ?2",
        limit,
        offset
    )
    .fetch_all(pool)
    .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deck_changeset_messages() {
        let changes = DeckChanges {
            name: Some(Some(String::new())),
            format: Some(Some("tiny".into())),
            play_count: Some(Some(-1)),
            skip_count: Some(Some(-1)),
            included_for_play: Some(None),
            ..DeckChanges::default()
        };
        let errors = validate(None, &changes).unwrap_err();
        assert_eq!(
            errors.message(),
            "format is invalid, included_for_play can't be blank, name can't be blank, play_count must be greater than or equal to 0, skip_count must be greater than or equal to 0"
        );
    }
}
