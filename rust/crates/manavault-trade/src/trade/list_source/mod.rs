//! Resolving pasted decklist text or a supported deck link into entries
//! (`Manavault.Trade.ListSource`).
//!
//! Links are recognized by lotus's [`DeckLink`]: Moxfield and Archidekt
//! decks (fetched only from their hardcoded API origins, with the id
//! validated from the link's path) and ManaVault share links
//! (`/share/decks|wants|binder/<token>`). A host-less share path resolves
//! locally against this instance's own shares with no outbound request (it
//! was copied from this browser's address bar). An absolute share link is
//! always fetched from its own origin's `/share/graphql`, even when that
//! origin is this instance, so a foreign instance's token is never mistaken
//! for a local one. Anything else is "unsupported".

pub mod local;
pub mod remote;
pub mod text;

use lotus::Zone;
use lotus::decklist::{DeckLink, DecklistClient};
use sqlx::SqlitePool;

pub const UNSUPPORTED: &str = "Unsupported link. Paste the list text instead.";
pub const NOTHING_TO_MATCH: &str = "Paste a decklist or a supported link to match.";
/// Source name of an imported want list.
pub const WANTS_SOURCE_NAME: &str = lotus::decklist::manavault::WANTS_NAME;
/// Source name of an imported trade binder.
pub const BINDER_SOURCE_NAME: &str = lotus::decklist::manavault::BINDER_NAME;

/// One normalized list entry. The quantity is as the source gave it: pasted
/// text may say `0 Sol Ring`, which is kept as is.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListEntry {
    pub name: String,
    pub quantity: i64,
    pub zone: Zone,
    pub set_code: Option<String>,
    pub collector_number: Option<String>,
}

/// A resolved list: the source's name (`None` for pasted text) and entries.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedList {
    pub source_name: Option<String>,
    pub entries: Vec<ListEntry>,
}

/// Why a list could not be resolved.
#[derive(Debug, thiserror::Error)]
pub enum ResolveError {
    /// A user-facing message.
    #[error("{0}")]
    User(&'static str),
    #[error(transparent)]
    Db(#[from] sqlx::Error),
}

fn present(value: Option<&str>) -> Option<&str> {
    value.filter(|value| !value.trim().is_empty())
}

/// Resolves `text`, else `url` (text wins when both are present), building
/// the HTTP client from `config` only when a link needs fetching
/// (`ListSource.resolve/1`).
pub async fn resolve(
    pool: &SqlitePool,
    config: &manavault_core::config::Config,
    url: Option<&str>,
    text: Option<&str>,
) -> Result<ResolvedList, ResolveError> {
    resolve_with(pool, || remote::client(config), url, text).await
}

/// [`resolve`] with a caller-supplied client factory.
pub async fn resolve_with<F>(
    pool: &SqlitePool,
    client: F,
    url: Option<&str>,
    text: Option<&str>,
) -> Result<ResolvedList, ResolveError>
where
    F: FnOnce() -> Result<DecklistClient, lotus::decklist::FetchError>,
{
    if let Some(text) = present(text) {
        return Ok(ResolvedList {
            source_name: None,
            entries: text::parse(pool, text).await?,
        });
    }
    let Some(url) = present(url) else {
        return Err(ResolveError::User(NOTHING_TO_MATCH));
    };
    let link = DeckLink::parse(url.trim()).map_err(|_| ResolveError::User(UNSUPPORTED))?;
    if let DeckLink::ManaVault {
        origin: None,
        share,
    } = &link
    {
        return local::fetch(pool, share)
            .await
            .map_err(|error| match error {
                local::LocalError::NotFound(message) => ResolveError::User(message),
                local::LocalError::Db(error) => ResolveError::Db(error),
            });
    }
    let fetched = {
        let make_client = || client().map_err(|_| remote::UNREACHABLE);
        match &link {
            DeckLink::Moxfield { id } => match make_client() {
                Ok(client) => remote::moxfield(&client, id).await,
                Err(_) => Err(remote::MOXFIELD_ERROR),
            },
            DeckLink::Archidekt { id } => match make_client() {
                Ok(client) => remote::archidekt(&client, id).await,
                Err(_) => Err(remote::ARCHIDEKT_ERROR),
            },
            DeckLink::ManaVault {
                origin: Some(origin),
                share,
            } => match make_client() {
                Ok(client) => remote::manavault(&client, origin, share).await,
                Err(message) => Err(message),
            },
            DeckLink::ManaVault { origin: None, .. } | DeckLink::Other { .. } => Err(UNSUPPORTED),
        }
    };
    fetched.map_err(ResolveError::User)
}
