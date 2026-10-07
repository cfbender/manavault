//! Decks linked to a Moxfield or Archidekt deck (`Decks.ExternalSource`,
//! `Decks.ExternalDeckSyncWorker`).
//!
//! While linked, the remote deck owns the decklist: decklist edits are
//! refused ([`crate::decks::ensure_decklist_editable`]) and [`sync`]
//! reconciles the local cards with the fetched entries. Allocations are
//! local and survive syncs: a card's copies are trimmed when its quantity
//! drops, cleared when it moves to Considering, and returned when it leaves
//! the remote deck. Printing and finish follow the remote deck only until a
//! copy is allocated, because allocation pins the card to the owned printing.
//!
//! Fetching and parsing use lotus (`DeckLink`, `DecklistClient`,
//! `MoxfieldDeck`, `ArchidektDeck`), which differs from the Elixir
//! `Trade.ListSource` modules in ways documented in `rust/notes/decks.md`:
//! Archidekt zones follow the primary category and the deck's
//! `includedInDeck` flags (cards in excluded categories are Considering),
//! quantities below one become one and unknown zones the mainboard, and
//! HTTP 401 is reported like 403 (the `:forbidden` message).

use std::collections::{BTreeMap, HashMap};

use async_trait::async_trait;
use lotus::decklist::{DeckLink, DecklistClient, Entry, FetchError};
use lotus::{Finish, OracleId, ScryfallId, Zone};
use sqlx::{SqliteConnection, SqlitePool};

use crate::catalog::search::cards_by_name;
use crate::db;
use crate::decks::cards::{self, DeckCardChanges};
use crate::decks::model::{DeckCardRow, DeckId, DeckRow, DeckStatus, ExternalSource, load_deck_on};
use crate::decks::records::get_deck;
use crate::decks::{DeckError, ensure_deck_editable};
use crate::jobs::{Job, Outcome, Unique, Worker};
use crate::state::AppState;
use crate::timefmt;

/// Why linking or syncing failed.
#[derive(Debug, thiserror::Error)]
pub enum SyncError {
    #[error(transparent)]
    Deck(#[from] DeckError),
    #[error(transparent)]
    Fetch(FetchError),
}

impl From<sqlx::Error> for SyncError {
    fn from(error: sqlx::Error) -> Self {
        Self::Deck(DeckError::Db(error))
    }
}

impl SyncError {
    /// The message recorded on the deck (`ExternalSource.failure_message/1`).
    #[must_use]
    pub fn failure_message(&self) -> String {
        match self {
            Self::Fetch(error) => match error {
                FetchError::Forbidden => "The deck site refused the request (HTTP 403).".to_owned(),
                FetchError::Timeout => "Timed out reaching the deck site.".to_owned(),
                FetchError::RequestFailed => "Could not reach the deck site.".to_owned(),
                FetchError::InvalidJson => {
                    "The deck site returned an unreadable response.".to_owned()
                }
                FetchError::BodyTooLarge => "The deck site's response was too large.".to_owned(),
                FetchError::NotFound => {
                    "The deck was not found; it may be private or deleted.".to_owned()
                }
                FetchError::HttpStatus(status) => format!("The deck site returned HTTP {status}."),
                other => format!("Could not sync: {other}"),
            },
            Self::Deck(DeckError::Invalid(errors)) => errors.message(),
            Self::Deck(DeckError::Message(message)) => message.clone(),
            Self::Deck(other) => format!("Could not sync: {other}"),
        }
    }

    /// The GraphQL error (`Errors.external_source_error/1`). Database
    /// failures are `None`: the resolver reports them as internal errors.
    #[must_use]
    pub fn graphql_message(&self) -> Option<String> {
        Some(match self {
            Self::Fetch(error) => match error {
                FetchError::Forbidden => {
                    "The deck site refused the request (HTTP 403). Try again later.".to_owned()
                }
                FetchError::Timeout => "Timed out reaching the deck site.".to_owned(),
                FetchError::RequestFailed => "Could not reach the deck site.".to_owned(),
                FetchError::NotFound => {
                    "That deck was not found; it may be private or deleted.".to_owned()
                }
                FetchError::HttpStatus(status) => format!("The deck site returned HTTP {status}."),
                _ => "Could not sync the external deck.".to_owned(),
            },
            Self::Deck(error) => match error {
                DeckError::DeckArchived => {
                    "Unarchive this deck before linking an external deck.".to_owned()
                }
                DeckError::Code("invalid_external_url") => {
                    "Enter a Moxfield or Archidekt deck link.".to_owned()
                }
                DeckError::Code("deck_not_linked") => {
                    "This deck is not linked to an external deck.".to_owned()
                }
                DeckError::DeckNotFound => "Deck was not found.".to_owned(),
                DeckError::Invalid(errors) => errors.message(),
                DeckError::Message(message) => message.clone(),
                DeckError::Db(_) => return None,
                _ => "Could not sync the external deck.".to_owned(),
            },
        })
    }
}

/// A recognized deck link: the source, its deck id, and the canonical URL.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExternalLink {
    pub source: ExternalSource,
    pub id: String,
    pub url: String,
}

/// `ExternalSource.parse_url/1`: Moxfield and Archidekt deck links only.
pub fn parse_url(url: &str) -> Result<ExternalLink, DeckError> {
    let link = DeckLink::parse(url).map_err(|_| DeckError::Code("invalid_external_url"))?;
    let source = match &link {
        DeckLink::Moxfield { .. } => ExternalSource::Moxfield,
        DeckLink::Archidekt { .. } => ExternalSource::Archidekt,
        DeckLink::ManaVault { .. } | DeckLink::Other { .. } => {
            return Err(DeckError::Code("invalid_external_url"));
        }
    };
    Ok(ExternalLink {
        source,
        id: link.id().to_owned(),
        url: link.canonical_url(),
    })
}

fn client(state: &AppState) -> Result<DecklistClient, FetchError> {
    let urls = &state.config.platform_urls;
    DecklistClient::builder(crate::state::USER_AGENT)
        .moxfield_api_base(urls.moxfield_api.clone())
        .archidekt_api_base(urls.archidekt_api.clone())
        .build()
}

async fn fetch(
    state: &AppState,
    source: ExternalSource,
    id: &str,
) -> Result<Vec<Entry>, FetchError> {
    let client = client(state)?;
    let decklist = match source {
        ExternalSource::Moxfield => client.fetch_moxfield(id).await?,
        ExternalSource::Archidekt => client.fetch_archidekt(id).await?,
    };
    Ok(decklist.entries)
}

/// A finished sync: the deck and the remote names that matched no card.
#[derive(Debug, Clone)]
pub struct Synced {
    pub deck: DeckRow,
    pub unresolved: Vec<String>,
}

/// `Decks.link_deck_external_source/2`: links the deck and imports the
/// remote list. A failed first fetch leaves the deck unlinked; the Elixir
/// code saved the link before fetching and kept it after a failure (only a
/// stale deck cache hid that from the next request).
pub async fn link(state: &AppState, deck_id: DeckId, url: &str) -> Result<Synced, SyncError> {
    let deck = get_deck(&state.db, deck_id).await?;
    ensure_deck_editable(&deck)?;
    let link = parse_url(url)?;
    let entries = fetch(state, link.source, &link.id)
        .await
        .map_err(SyncError::Fetch)?;
    let mut tx = db::begin_write(&state.db).await?;
    let now = timefmt::now();
    sqlx::query!(
        r#"UPDATE decks SET external_source = ?2, external_id = ?3, external_url = ?4,
                 external_synced_at = NULL, external_sync_error = NULL, updated_at = ?5
           WHERE id = ?1"#,
        deck_id,
        link.source,
        link.id,
        link.url,
        now
    )
    .execute(&mut *tx)
    .await?;
    let unresolved = apply_entries(&mut tx, &state.db, deck_id, &entries).await?;
    let deck = load_deck_on(&mut tx, deck_id)
        .await?
        .ok_or(DeckError::DeckNotFound)?;
    tx.commit().await?;
    Ok(Synced { deck, unresolved })
}

/// `Decks.unlink_deck_external_source/1`: keeps the decklist as it is.
pub async fn unlink(pool: &SqlitePool, deck_id: DeckId) -> Result<DeckRow, DeckError> {
    let deck = get_deck(pool, deck_id).await?;
    if !deck.is_linked() {
        return Err(DeckError::Code("deck_not_linked"));
    }
    let now = timefmt::now();
    sqlx::query!(
        r#"UPDATE decks SET external_source = NULL, external_id = NULL, external_url = NULL,
                 external_synced_at = NULL, external_sync_error = NULL, updated_at = ?2
           WHERE id = ?1"#,
        deck_id,
        now
    )
    .execute(pool)
    .await?;
    get_deck(pool, deck_id).await
}

/// `Decks.sync_deck_external_source/1`: fetches the remote deck and
/// reconciles the decklist; the outcome (sync time or error message) is
/// recorded on the deck either way.
pub async fn sync(state: &AppState, deck_id: DeckId) -> Result<Synced, SyncError> {
    let deck = get_deck(&state.db, deck_id).await?;
    let (Some(source), Some(id)) = (deck.external_source, deck.external_id.clone()) else {
        return Err(DeckError::Code("deck_not_linked").into());
    };
    let result = match fetch(state, source, &id).await {
        Ok(entries) => apply_and_record(&state.db, deck_id, &entries).await,
        Err(error) => Err(SyncError::Fetch(error)),
    };
    if let Err(error) = &result {
        record_failure(&state.db, deck_id, error).await?;
    }
    result
}

async fn apply_and_record(
    pool: &SqlitePool,
    deck_id: DeckId,
    entries: &[Entry],
) -> Result<Synced, SyncError> {
    let mut tx = db::begin_write(pool).await?;
    let unresolved = apply_entries(&mut tx, pool, deck_id, entries).await?;
    let deck = load_deck_on(&mut tx, deck_id)
        .await?
        .ok_or(DeckError::DeckNotFound)?;
    tx.commit().await?;
    Ok(Synced { deck, unresolved })
}

async fn record_failure(
    pool: &SqlitePool,
    deck_id: DeckId,
    error: &SyncError,
) -> Result<(), sqlx::Error> {
    let message: String = error.failure_message().chars().take(1_000).collect();
    let now = timefmt::now();
    sqlx::query!(
        "UPDATE decks SET external_sync_error = ?2, updated_at = ?3 WHERE id = ?1",
        deck_id,
        message,
        now
    )
    .execute(pool)
    .await?;
    Ok(())
}

/// `Decks.sync_all_deck_external_sources/0`: every linked deck that is not
/// archived, by id.
pub async fn sync_all(
    state: &AppState,
) -> Result<Vec<(DeckId, Result<Synced, SyncError>)>, sqlx::Error> {
    let ids: Vec<DeckId> = sqlx::query_scalar!(
        r#"SELECT id AS "id!: DeckId" FROM decks
           WHERE external_source IS NOT NULL AND status != 'archived' ORDER BY id"#
    )
    .fetch_all(&state.db)
    .await?;
    let mut results = Vec::with_capacity(ids.len());
    for id in ids {
        results.push((id, sync(state, id).await));
    }
    Ok(results)
}

#[derive(Debug, Clone)]
struct Desired {
    oracle_id: OracleId,
    zone: Zone,
    quantity: u32,
    finish: Finish,
    preferred_printing_id: Option<ScryfallId>,
}

/// Resolves entries by printing, else by name; sums split entries per card
/// and zone. Returns the desired rows keyed by `(oracle id, zone)` and the
/// unresolved names (first occurrence order, without duplicates).
async fn resolve_entries(
    pool: &SqlitePool,
    entries: &[Entry],
) -> Result<(BTreeMap<(OracleId, &'static str), Desired>, Vec<String>), sqlx::Error> {
    let printing_ids: Vec<ScryfallId> = entries
        .iter()
        .filter_map(|entry| entry.scryfall_id.clone())
        .collect();
    let printings: HashMap<ScryfallId, OracleId> = if printing_ids.is_empty() {
        HashMap::new()
    } else {
        let ids = crate::catalog::sql::json_list(&printing_ids);
        sqlx::query!(
            r#"SELECT scryfall_id AS "scryfall_id!: ScryfallId", oracle_id AS "oracle_id!: OracleId"
               FROM scryfall_printings WHERE scryfall_id IN (SELECT value FROM json_each(?1))"#,
            ids
        )
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| (row.scryfall_id, row.oracle_id))
        .collect()
    };
    let names: Vec<&str> = entries.iter().map(|entry| entry.name.as_str()).collect();
    let cards = cards_by_name::by_names(pool, &names).await?;

    let mut desired: BTreeMap<(OracleId, &'static str), Desired> = BTreeMap::new();
    let mut unresolved: Vec<String> = Vec::new();
    for entry in entries {
        let resolved = match entry.scryfall_id.as_ref().and_then(|id| {
            printings
                .get(id)
                .map(|oracle| (oracle.clone(), Some(id.clone())))
        }) {
            Some(found) => Some(found),
            None => cards
                .get(&cards_by_name::key(&entry.name))
                .map(|card| (card.oracle_id.clone(), None)),
        };
        let Some((oracle_id, preferred)) = resolved else {
            if !unresolved.contains(&entry.name) {
                unresolved.push(entry.name.clone());
            }
            continue;
        };
        desired
            .entry((oracle_id.clone(), entry.zone.as_str()))
            .and_modify(|existing| {
                existing.quantity = existing.quantity.saturating_add(entry.quantity.get());
                if existing.preferred_printing_id.is_none() {
                    existing.preferred_printing_id.clone_from(&preferred);
                }
            })
            .or_insert_with(|| Desired {
                oracle_id,
                zone: entry.zone,
                quantity: entry.quantity.get(),
                finish: entry.finish,
                preferred_printing_id: preferred,
            });
    }
    Ok((desired, unresolved))
}

/// Whether the card holds reserved collection copies.
async fn holds_copies(conn: &mut SqliteConnection, row: &DeckCardRow) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM deck_allocations WHERE deck_card_id = ?1) AS "held!: bool""#,
        row.id
    )
    .fetch_one(conn)
    .await
}

/// Remote printing and finish changes, for cards that hold no copies.
async fn printing_changes(
    conn: &mut SqliteConnection,
    row: &DeckCardRow,
    desired: &Desired,
    mut changes: DeckCardChanges,
) -> Result<DeckCardChanges, sqlx::Error> {
    if !holds_copies(conn, row).await? {
        changes.finish = Some(Some(desired.finish.as_str().to_owned()));
        if let Some(printing) = &desired.preferred_printing_id {
            changes.preferred_printing_id = Some(Some(printing.clone()));
        }
    }
    Ok(changes)
}

async fn apply_entries(
    conn: &mut SqliteConnection,
    pool: &SqlitePool,
    deck_id: DeckId,
    entries: &[Entry],
) -> Result<Vec<String>, DeckError> {
    let (desired, unresolved) = resolve_entries(pool, entries).await?;
    let existing: BTreeMap<(OracleId, &'static str), DeckCardRow> =
        crate::decks::model::deck_card_rows(conn, deck_id)
            .await?
            .into_iter()
            .map(|row| ((row.oracle_id.clone(), row.zone.as_str()), row))
            .collect();
    let (kept, removed): (BTreeMap<_, _>, BTreeMap<_, _>) = existing
        .into_iter()
        .partition(|(key, _)| desired.contains_key(key));

    // A card that left one zone and appeared in another carries its row
    // over, so its tags survive.
    let mut pool_by_oracle: HashMap<OracleId, Vec<DeckCardRow>> = HashMap::new();
    for row in removed.values() {
        pool_by_oracle
            .entry(row.oracle_id.clone())
            .or_default()
            .push(row.clone());
    }
    let mut moved: HashMap<(OracleId, &'static str), DeckCardRow> = HashMap::new();
    for key in desired.keys().filter(|key| !kept.contains_key(*key)) {
        if let Some(rows) = pool_by_oracle.get_mut(&key.0)
            && !rows.is_empty()
        {
            moved.insert(key.clone(), rows.remove(0));
        }
    }

    for (key, wanted) in &desired {
        let quantity = Some(Some(i64::from(wanted.quantity)));
        if let Some(row) = kept.get(key) {
            let changes = printing_changes(
                conn,
                row,
                wanted,
                DeckCardChanges {
                    quantity,
                    ..DeckCardChanges::default()
                },
            )
            .await?;
            let updated =
                cards::write_import_row(conn, deck_id, &row.oracle_id, Some(row), &changes).await?;
            if updated.quantity < row.quantity {
                manavault_allocation::trim_deck_card_allocations(conn, row.id).await?;
            }
        } else if let Some(row) = moved.get(key) {
            let mut changes = printing_changes(
                conn,
                row,
                wanted,
                DeckCardChanges {
                    quantity,
                    zone: Some(Some(wanted.zone.as_str().to_owned())),
                    ..DeckCardChanges::default()
                },
            )
            .await?;
            if wanted.zone == Zone::Considering {
                changes.proxy_quantity = Some(Some(0));
            }
            let updated =
                cards::write_import_row(conn, deck_id, &row.oracle_id, Some(row), &changes).await?;
            if wanted.zone == Zone::Considering {
                manavault_allocation::clear_deck_card_allocations(conn, row.id).await?;
            } else if updated.quantity < row.quantity {
                manavault_allocation::trim_deck_card_allocations(conn, row.id).await?;
            }
        } else {
            let changes = DeckCardChanges {
                quantity,
                zone: Some(Some(wanted.zone.as_str().to_owned())),
                finish: Some(Some(wanted.finish.as_str().to_owned())),
                preferred_printing_id: wanted.preferred_printing_id.clone().map(Some),
                ..DeckCardChanges::default()
            };
            cards::write_import_row(conn, deck_id, &wanted.oracle_id, None, &changes).await?;
        }
    }

    let moved_ids: Vec<_> = moved.values().map(|row| row.id).collect();
    for row in removed.values().filter(|row| !moved_ids.contains(&row.id)) {
        cards::delete_unchecked_in(conn, row).await?;
    }

    let now = timefmt::now();
    sqlx::query!(
        "UPDATE decks SET external_synced_at = ?2, external_sync_error = NULL, updated_at = ?2 WHERE id = ?1",
        deck_id,
        now
    )
    .execute(&mut *conn)
    .await?;
    Ok(unresolved)
}

/// The Oban worker name.
pub const WORKER: &str = "Manavault.Catalog.Decks.ExternalDeckSyncWorker";

/// Hourly cron job that re-syncs every linked deck. Failures are recorded
/// on each deck, so the job only logs.
pub struct ExternalDeckSyncWorker;

#[async_trait]
impl Worker for ExternalDeckSyncWorker {
    fn name(&self) -> &'static str {
        WORKER
    }

    fn queue(&self) -> &'static str {
        "catalog"
    }

    fn max_attempts(&self) -> i64 {
        1
    }

    fn unique(&self) -> Option<Unique> {
        Some(Unique::Worker)
    }

    fn timeout(&self) -> std::time::Duration {
        std::time::Duration::from_secs(15 * 60)
    }

    async fn perform(&self, state: &AppState, _job: &Job) -> Outcome {
        let results = match sync_all(state).await {
            Ok(results) => results,
            Err(error) => return Outcome::Retry(error.to_string()),
        };
        let failed: Vec<&(DeckId, Result<Synced, SyncError>)> = results
            .iter()
            .filter(|(_, result)| result.is_err())
            .collect();
        if !results.is_empty() {
            tracing::info!(
                "External deck sync finished ok={} failed={}",
                results.len() - failed.len(),
                failed.len()
            );
        }
        for (deck_id, result) in failed {
            if let Err(error) = result {
                tracing::warn!("External deck sync failed for deck {}: {error}", deck_id.0);
            }
        }
        Outcome::Done
    }
}

/// Whether the deck can be synced by the cron job.
#[must_use]
pub fn syncable(deck: &DeckRow) -> bool {
    deck.is_linked() && deck.status != DeckStatus::Archived
}
