//! The singleton share links (`Manavault.Trade.SingletonShare`,
//! `WantsShare`, `BinderShare`): one token for the whole want list and one
//! for the whole trade binder, generated lazily, revoked by deleting every
//! row, and rotated with collision retry. Tokens have the deck share token
//! format (`Catalog.Decks.ShareToken`).

use base64::Engine as _;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::trade::binder::{self, BinderEntry};
use crate::trade::want;
use manavault_core::timestamp::Timestamp;

/// How many fresh tokens a rotation tries before giving up.
const SHARE_TOKEN_ATTEMPTS: u32 = 5;

/// Which singleton share.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ShareKind {
    /// `trade_want_shares`.
    Wants,
    /// `trade_binder_shares`.
    Binder,
}

/// A new share token: 18 random bytes, URL-safe base64 without padding
/// (`ShareToken.generate/0`).
#[must_use]
pub fn generate_token() -> String {
    URL_SAFE_NO_PAD.encode(manavault_core::crypto::random_bytes::<18>())
}

/// Whether `token` has the share token shape (`ShareToken.valid?/1`): 24
/// URL-safe base64 characters, which always decode to 18 bytes.
#[must_use]
pub fn valid_token(token: &str) -> bool {
    lotus::decklist::is_share_token(token)
}

/// The current token, or `None` before one is created (`token/1`).
pub async fn token(pool: &SqlitePool, kind: ShareKind) -> Result<Option<String>, sqlx::Error> {
    let mut conn = pool.acquire().await?;
    earliest(&mut conn, kind).await
}

async fn earliest(
    conn: &mut sqlx::SqliteConnection,
    kind: ShareKind,
) -> Result<Option<String>, sqlx::Error> {
    match kind {
        ShareKind::Wants => {
            sqlx::query_scalar!("SELECT token FROM trade_want_shares ORDER BY id ASC LIMIT 1")
                .fetch_optional(conn)
                .await
        }
        ShareKind::Binder => {
            sqlx::query_scalar!("SELECT token FROM trade_binder_shares ORDER BY id ASC LIMIT 1")
                .fetch_optional(conn)
                .await
        }
    }
}

async fn insert(
    tx: &mut Transaction<'static, Sqlite>,
    kind: ShareKind,
    token: &str,
) -> Result<(), sqlx::Error> {
    let now = Timestamp::now();
    match kind {
        ShareKind::Wants => sqlx::query!(
            "INSERT INTO trade_want_shares (token, inserted_at, updated_at) VALUES (?1, ?2, ?2)",
            token,
            now
        )
        .execute(&mut **tx)
        .await?,
        ShareKind::Binder => sqlx::query!(
            "INSERT INTO trade_binder_shares (token, inserted_at, updated_at) VALUES (?1, ?2, ?2)",
            token,
            now
        )
        .execute(&mut **tx)
        .await?,
    };
    Ok(())
}

async fn delete_all(
    tx: &mut Transaction<'static, Sqlite>,
    kind: ShareKind,
) -> Result<u64, sqlx::Error> {
    let result = match kind {
        ShareKind::Wants => {
            sqlx::query!("DELETE FROM trade_want_shares")
                .execute(&mut **tx)
                .await?
        }
        ShareKind::Binder => {
            sqlx::query!("DELETE FROM trade_binder_shares")
                .execute(&mut **tx)
                .await?
        }
    };
    Ok(result.rows_affected())
}

fn unique_violation(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .is_some_and(sqlx::error::DatabaseError::is_unique_violation)
}

/// Returns the token, creating the row on first use (`ensure_token/1`). The
/// write transaction serializes this with disable and rotate, so an
/// in-flight ensure cannot re-enable sharing after a revoke.
pub async fn ensure_token(pool: &SqlitePool, kind: ShareKind) -> Result<String, sqlx::Error> {
    let mut tx = manavault_core::db::begin_write(pool).await?;
    if let Some(token) = earliest(&mut tx, kind).await? {
        tx.commit().await?;
        return Ok(token);
    }
    match insert(&mut tx, kind, &generate_token()).await {
        Ok(()) => {}
        // Someone else's token already took this value: use theirs.
        Err(error) if unique_violation(&error) => {}
        Err(error) => return Err(error),
    }
    let token = earliest(&mut tx, kind)
        .await?
        .ok_or(sqlx::Error::RowNotFound)?;
    tx.commit().await?;
    Ok(token)
}

/// Turns sharing off, deleting every row; how many were deleted
/// (`disable/1`).
pub async fn disable(pool: &SqlitePool, kind: ShareKind) -> Result<u64, sqlx::Error> {
    let mut tx = manavault_core::db::begin_write(pool).await?;
    let count = delete_all(&mut tx, kind).await?;
    tx.commit().await?;
    Ok(count)
}

/// Why a rotation failed.
#[derive(Debug, thiserror::Error)]
pub enum RotateError {
    /// Every attempt generated a token that already existed.
    #[error("Could not generate a unique share link.")]
    Collision,
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Replaces every row with exactly one fresh token (`rotate/1`).
pub async fn rotate(pool: &SqlitePool, kind: ShareKind) -> Result<String, RotateError> {
    for _ in 0..SHARE_TOKEN_ATTEMPTS {
        let mut tx = manavault_core::db::begin_write(pool).await?;
        delete_all(&mut tx, kind).await?;
        let token = generate_token();
        match insert(&mut tx, kind, &token).await {
            Ok(()) => {
                tx.commit().await?;
                return Ok(token);
            }
            Err(error) if unique_violation(&error) => tx.rollback().await?,
            Err(error) => return Err(error.into()),
        }
    }
    Err(RotateError::Collision)
}

/// Whether `token` is well-formed and is the current token (`matches?/2`).
pub async fn matches(pool: &SqlitePool, kind: ShareKind, token: &str) -> Result<bool, sqlx::Error> {
    if !valid_token(token) {
        return Ok(false);
    }
    Ok(self::token(pool, kind).await?.as_deref() == Some(token))
}

/// One public want-list entry (`WantsListEntry`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WantsEntry {
    pub card_name: String,
    pub quantity: i64,
    pub type_line: Option<String>,
    pub set_code: Option<String>,
    pub collector_number: Option<String>,
    pub image_url: Option<String>,
}

/// The public want list for `token`, or `None` unless it is the current
/// token (`Trade.wants_list_by_share_token/1`). Entries are in creation
/// order; set and collector number only for printing-specific wants.
pub async fn wants_list(
    pool: &SqlitePool,
    token: &str,
) -> Result<Option<Vec<WantsEntry>>, sqlx::Error> {
    if !matches(pool, ShareKind::Wants, token).await? {
        return Ok(None);
    }
    let rows = sqlx::query!(
        r#"SELECT c.name AS "card_name!", c.type_line AS "type_line?",
             w.quantity AS "quantity!", w.preferred_printing_id AS "preferred_printing_id?",
             pp.set_code AS "set_code?", pp.collector_number AS "collector_number?",
             pp.image_uris AS "preferred_image_uris?",
             (SELECT p.image_uris FROM scryfall_printings AS p
               WHERE p.oracle_id = w.oracle_id
               ORDER BY p.released_at DESC, p.set_code ASC, p.collector_number ASC
               LIMIT 1) AS "latest_image_uris?: String"
           FROM trade_wants AS w
           JOIN scryfall_cards AS c ON c.oracle_id = w.oracle_id
           LEFT JOIN scryfall_printings AS pp ON pp.scryfall_id = w.preferred_printing_id
           ORDER BY w.id ASC"#
    )
    .fetch_all(pool)
    .await?;
    Ok(Some(
        rows.into_iter()
            .map(|row| {
                let image_url = match (&row.preferred_printing_id, &row.preferred_image_uris) {
                    (Some(_), Some(uris)) => want::image_url(uris),
                    _ => row.latest_image_uris.as_deref().and_then(want::image_url),
                };
                WantsEntry {
                    card_name: row.card_name,
                    quantity: row.quantity,
                    type_line: row.type_line,
                    set_code: row.set_code,
                    collector_number: row.collector_number,
                    image_url,
                }
            })
            .collect(),
    ))
}

/// The public trade binder for `token`, or `None` unless it is the current
/// token (`Trade.binder_list_by_share_token/1`).
pub async fn binder_list(
    pool: &SqlitePool,
    token: &str,
) -> Result<Option<Vec<BinderEntry>>, sqlx::Error> {
    if !matches(pool, ShareKind::Binder, token).await? {
        return Ok(None);
    }
    binder::entries(pool).await.map(Some)
}
