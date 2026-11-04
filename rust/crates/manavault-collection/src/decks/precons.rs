//! Commander precons: the Commander decks Wizards of the Coast publishes on
//! Moxfield (<https://moxfield.com/users/WizardsOfTheCoast>), and importing
//! one as a new deck.
//!
//! The list comes from Moxfield's deck search, one request per hundred
//! decks, and is cached for twelve hours. An import fetches the deck like a
//! linked deck does but leaves the new deck unlinked, so it can be edited.
//! With `add_to_collection`, each card in the command zone and main deck
//! becomes a collection item of the precon's printing and finish (stored in
//! the chosen location) and is allocated to the deck, all in the deck's
//! creation transaction. Basic lands are skipped: decks count them as
//! allocated without copies.

use std::sync::LazyLock;
use std::time::Duration;

use async_graphql::MaybeUndefined;
use lotus::decklist::FetchError;
use lotus::{Finish, Quantity, Zone};
use regex::Regex;
use serde::{Deserialize, Serialize};
use sqlx::SqliteConnection;

use crate::collection::changes::{self, ItemChanges, ItemError};
use crate::decks::DeckError;
use crate::decks::external::{self, SyncError};
use crate::decks::model::{
    CollectionItemId, DeckCardId, DeckId, DeckRow, ExternalSource, load_deck_on,
};
use crate::decks::records::{self, DeckChanges};
use manavault_catalog::pricing::PriceStore;
use manavault_core::db;
use manavault_core::state::AppState;

/// The Moxfield user whose Commander decks are the precons.
pub const AUTHOR: &str = "WizardsOfTheCoast";
const CACHE_KEY: &str = "moxfield:commander_precons";
const CACHE_TTL: Duration = Duration::from_secs(12 * 60 * 60);
const PAGE_SIZE: u32 = 100;
/// Stops a search whose page count never ends.
const MAX_PAGES: u32 = 20;

/// One precon in the list.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Precon {
    /// Moxfield's public deck id.
    pub id: String,
    /// The deck's own name, such as `Subjective Reality`.
    pub name: String,
    /// The product it came in, such as `Commander 2018`, when the Moxfield
    /// name says.
    pub product: Option<String>,
    /// Single-letter color codes in WUBRG order.
    pub color_identity: Vec<String>,
    pub url: String,
    /// When Moxfield created the deck, used for newest-first order.
    pub created_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchPage {
    #[serde(default)]
    total_pages: u32,
    #[serde(default)]
    data: Vec<SearchDeck>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchDeck {
    public_id: String,
    name: String,
    #[serde(default)]
    color_identity: Vec<String>,
    #[serde(default)]
    created_at_utc: Option<String>,
}

/// `Deck Name (Product Precon Decklist)`, Moxfield's naming for the
/// account's decks.
static PRECON_NAME: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"(?i)^(.+?)\s*\((.+?)\s+precon\s+decklist\)\s*$").ok());

/// Splits a Moxfield deck name into the deck's own name and its product.
#[must_use]
pub fn split_name(full: &str) -> (String, Option<String>) {
    let full = full.trim();
    match PRECON_NAME.as_ref().and_then(|re| re.captures(full)) {
        Some(captures) => (
            captures[1].trim().to_owned(),
            Some(captures[2].trim().to_owned()),
        ),
        None => (full.to_owned(), None),
    }
}

fn precon(deck: SearchDeck) -> Precon {
    let (name, product) = split_name(&deck.name);
    let color_identity = ["W", "U", "B", "R", "G"]
        .into_iter()
        .filter(|color| deck.color_identity.iter().any(|code| code == color))
        .map(str::to_owned)
        .collect();
    Precon {
        url: format!("https://moxfield.com/decks/{}", deck.public_id),
        id: deck.public_id,
        name,
        product,
        color_identity,
        created_at: deck.created_at_utc,
    }
}

fn request_error(error: &reqwest::Error) -> FetchError {
    if error.is_timeout() {
        FetchError::Timeout
    } else {
        FetchError::RequestFailed
    }
}

async fn search_page(state: &AppState, page: u32) -> Result<SearchPage, FetchError> {
    let page = page.to_string();
    let size = PAGE_SIZE.to_string();
    let response = state
        .http
        .get(&state.config.platform_urls.moxfield_deck_search)
        .header(reqwest::header::ACCEPT, "application/json")
        .query(&[
            ("authorUserNames", AUTHOR),
            ("fmt", "commander"),
            ("pageNumber", page.as_str()),
            ("pageSize", size.as_str()),
            ("sortType", "created"),
            ("sortDirection", "descending"),
            ("showIllegal", "true"),
        ])
        .send()
        .await
        .map_err(|error| request_error(&error))?;
    match response.status().as_u16() {
        200..=299 => {}
        401 | 403 => return Err(FetchError::Forbidden),
        404 => return Err(FetchError::NotFound),
        status => return Err(FetchError::HttpStatus(status)),
    }
    let body = response
        .bytes()
        .await
        .map_err(|error| request_error(&error))?;
    serde_json::from_slice(&body).map_err(|_| FetchError::InvalidJson)
}

/// Every precon, newest first; cached for twelve hours.
pub async fn list(state: &AppState) -> Result<Vec<Precon>, FetchError> {
    if let Some(cached) = state.cache_get::<Vec<Precon>>(CACHE_KEY).await {
        return Ok(cached);
    }
    let mut precons: Vec<Precon> = Vec::new();
    let mut page = 1;
    loop {
        let result = search_page(state, page).await?;
        for deck in result.data {
            if !precons.iter().any(|known| known.id == deck.public_id) {
                precons.push(precon(deck));
            }
        }
        if page >= result.total_pages.min(MAX_PAGES) {
            break;
        }
        page += 1;
    }
    // ISO timestamps order as text; undated decks go last.
    precons.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    state.cache_put(CACHE_KEY, &precons, CACHE_TTL).await;
    Ok(precons)
}

/// What to import.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct PreconImport {
    /// Moxfield's public deck id.
    pub precon_id: String,
    /// The new deck's name; the precon's own name when blank.
    pub name: Option<String>,
    pub add_to_collection: bool,
    /// Where added copies are stored (and return to when released).
    pub location_id: Option<i64>,
}

/// A finished import.
#[derive(Debug, Clone)]
pub struct Imported {
    pub deck: DeckRow,
    /// Names that matched no card in the catalog.
    pub unresolved: Vec<String>,
    /// Copies added to the collection and allocated to the deck.
    pub added_to_collection: u32,
}

/// Imports a precon as a new deck, optionally adding its cards to the
/// collection and allocating them. Nothing is written when any step fails.
pub async fn import(state: &AppState, input: &PreconImport) -> Result<Imported, SyncError> {
    let link = external::parse_url(&format!(
        "https://moxfield.com/decks/{}",
        input.precon_id.trim()
    ))?;
    if link.source != ExternalSource::Moxfield {
        return Err(DeckError::Code("invalid_external_url").into());
    }
    let location_id = if input.add_to_collection {
        input.location_id
    } else {
        None
    };
    if let Some(location_id) = location_id {
        ensure_storage_location(&state.db, location_id).await?;
    }
    let decklist = external::client(state)
        .map_err(SyncError::Fetch)?
        .fetch_moxfield(&link.id)
        .await
        .map_err(SyncError::Fetch)?;
    let name = input
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .or_else(|| decklist.name.as_deref().map(|name| split_name(name).0))
        .unwrap_or_else(|| "Commander precon".to_owned());

    let mut tx = db::begin_write(&state.db).await?;
    let deck = records::create_deck_in(
        &mut tx,
        &DeckChanges {
            name: Some(Some(name)),
            format: Some(Some("commander".to_owned())),
            ..DeckChanges::default()
        },
    )
    .await?;
    let unresolved =
        external::write_entries(&mut tx, &state.db, deck.id, &decklist.entries).await?;
    let added_to_collection = if input.add_to_collection {
        add_to_collection(&mut tx, &state.prices, deck.id, location_id).await?
    } else {
        0
    };
    let deck = load_deck_on(&mut tx, deck.id)
        .await?
        .ok_or(DeckError::DeckNotFound)?;
    tx.commit().await?;
    Ok(Imported {
        deck,
        unresolved,
        added_to_collection,
    })
}

/// Allocated copies leave their location, so a list location (wanted
/// cards) cannot hold them.
async fn ensure_storage_location(pool: &sqlx::SqlitePool, id: i64) -> Result<(), DeckError> {
    let kind: Option<String> =
        sqlx::query_scalar!(r#"SELECT kind AS "kind!" FROM locations WHERE id = ?1"#, id)
            .fetch_optional(pool)
            .await?;
    match kind.as_deref() {
        None => Err(DeckError::Message("Location was not found.".to_owned())),
        Some("list") => Err(DeckError::Message(
            "List locations hold wanted cards; choose where the precon's cards are stored."
                .to_owned(),
        )),
        Some(_) => Ok(()),
    }
}

fn item_error(error: ItemError) -> DeckError {
    match error {
        ItemError::Db(error) => DeckError::Db(error),
        other => DeckError::Message(other.to_string()),
    }
}

/// Adds a collection item for each command zone and main deck card (basic
/// lands excepted) and allocates it; returns the number of copies.
async fn add_to_collection(
    conn: &mut SqliteConnection,
    prices: &PriceStore,
    deck_id: DeckId,
    location_id: Option<i64>,
) -> Result<u32, DeckError> {
    let considering = Zone::Considering.as_str();
    // A card whose precon printing is not in the catalog gets its newest
    // English printing.
    let rows = sqlx::query!(
        r#"SELECT dc.id AS "id!: DeckCardId", dc.quantity AS "quantity!: i64",
                  dc.finish AS "finish!", c.type_line,
                  COALESCE(dc.preferred_printing_id,
                    (SELECT p.scryfall_id FROM scryfall_printings p
                     WHERE p.oracle_id = dc.oracle_id
                     ORDER BY p.lang = 'en' DESC, p.released_at DESC, p.scryfall_id
                     LIMIT 1)) AS "printing: String"
           FROM deck_cards dc JOIN scryfall_cards c ON c.oracle_id = dc.oracle_id
           WHERE dc.deck_id = ?1 AND dc.zone != ?2
           ORDER BY dc.id"#,
        deck_id,
        considering
    )
    .fetch_all(&mut *conn)
    .await?;
    let mut copies: u32 = 0;
    for row in rows {
        if row.type_line.as_deref().is_some_and(lotus::is_basic_land) {
            continue;
        }
        let (Some(printing), Some(quantity)) = (
            row.printing,
            u32::try_from(row.quantity).ok().and_then(Quantity::new),
        ) else {
            continue;
        };
        let finish = Finish::parse(&row.finish).unwrap_or(Finish::Nonfoil);
        let item = changes::create_in(
            conn,
            prices,
            ItemChanges {
                scryfall_id: MaybeUndefined::Value(printing),
                quantity: MaybeUndefined::Value(row.quantity),
                finish: MaybeUndefined::Value(finish.as_str().to_owned()),
                location_id: location_id.map_or(MaybeUndefined::Undefined, MaybeUndefined::Value),
                ..ItemChanges::default()
            },
        )
        .await
        .map_err(item_error)?;
        manavault_allocation::allocate_in(conn, row.id, CollectionItemId(item), quantity).await?;
        copies = copies.saturating_add(quantity.get());
    }
    Ok(copies)
}
