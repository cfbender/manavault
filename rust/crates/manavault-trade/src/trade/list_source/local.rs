//! Host-less ManaVault share links, resolved against this instance's own
//! data with no outbound request (`Manavault.Trade.ListSource.ManaVault`).

use lotus::Zone;
use lotus::decklist::{ShareKind, ShareLink};
use sqlx::SqlitePool;

use crate::trade::list_source::{BINDER_SOURCE_NAME, ListEntry, ResolvedList, WANTS_SOURCE_NAME};
use crate::trade::share;

pub const DECK_NOT_FOUND: &str = "That share link doesn't match a deck on this ManaVault instance. \
     If it came from another vault, paste the list text instead.";
pub const WANTS_NOT_FOUND: &str = "That share link doesn't match a shared want list on this \
     ManaVault instance. If it came from another vault, paste the list text instead.";
pub const BINDER_NOT_FOUND: &str = "That share link doesn't match a shared trade binder on this \
     ManaVault instance. If it came from another vault, paste the list text instead.";

/// Why a local share could not be resolved.
#[derive(Debug, thiserror::Error)]
pub enum LocalError {
    /// The token matches nothing here; the message names the share kind.
    #[error("{0}")]
    NotFound(&'static str),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

/// Resolves the local share a link names (`ManaVault.fetch/2`).
pub async fn fetch(pool: &SqlitePool, share: &ShareLink) -> Result<ResolvedList, LocalError> {
    match share.kind {
        ShareKind::Deck => deck(pool, &share.token).await,
        ShareKind::Wants => {
            let entries = share::wants_list(pool, &share.token)
                .await?
                .ok_or(LocalError::NotFound(WANTS_NOT_FOUND))?;
            Ok(ResolvedList {
                source_name: Some(WANTS_SOURCE_NAME.to_owned()),
                entries: entries
                    .into_iter()
                    .map(|entry| ListEntry {
                        name: entry.card_name,
                        quantity: entry.quantity,
                        zone: Zone::Mainboard,
                        set_code: entry.set_code,
                        collector_number: entry.collector_number,
                    })
                    .collect(),
            })
        }
        ShareKind::Binder => {
            let entries = share::binder_list(pool, &share.token)
                .await?
                .ok_or(LocalError::NotFound(BINDER_NOT_FOUND))?;
            Ok(ResolvedList {
                source_name: Some(BINDER_SOURCE_NAME.to_owned()),
                entries: entries
                    .into_iter()
                    .map(|entry| ListEntry {
                        name: entry.card_name,
                        quantity: entry.quantity,
                        zone: Zone::Mainboard,
                        set_code: entry.set_code,
                        collector_number: entry.collector_number,
                    })
                    .collect(),
            })
        }
    }
}

/// The shared deck's cards with their zones; legacy `sideboard` and
/// `maybeboard` zones read as considering.
async fn deck(pool: &SqlitePool, token: &str) -> Result<ResolvedList, LocalError> {
    let deck = sqlx::query!(
        r#"SELECT id AS "id!", name FROM decks WHERE share_token = ?1"#,
        token
    )
    .fetch_optional(pool)
    .await?
    .ok_or(LocalError::NotFound(DECK_NOT_FOUND))?;
    let cards = sqlx::query!(
        r#"SELECT c.name AS "name!", dc.quantity AS "quantity!", dc.zone AS "zone!"
           FROM deck_cards AS dc JOIN scryfall_cards AS c ON c.oracle_id = dc.oracle_id
           WHERE dc.deck_id = ?1
           ORDER BY dc.zone ASC, c.name ASC, dc.id ASC"#,
        deck.id
    )
    .fetch_all(pool)
    .await?;
    Ok(ResolvedList {
        source_name: Some(deck.name),
        entries: cards
            .into_iter()
            .map(|card| ListEntry {
                name: card.name,
                quantity: card.quantity,
                zone: Zone::parse(&card.zone).unwrap_or(Zone::Mainboard),
                set_code: None,
                collector_number: None,
            })
            .collect(),
    })
}
