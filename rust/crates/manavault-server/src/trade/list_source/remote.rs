//! Deck links fetched over HTTP through lotus's [`DecklistClient`]:
//! Moxfield, Archidekt, and other ManaVault instances' share links
//! (`ListSource.Moxfield`, `.Archidekt`, `.ManaVaultRemote`, `.Http`).
//!
//! lotus keeps the hardening of earlier releases (no redirects, capped
//! streamed bodies, 10 s timeouts, the public-destination policy with DNS
//! pinning, and the ManaVault page/entry/byte/time budget). This module maps
//! its [`FetchError`]s to the established user-facing messages.
//!
//! Known differences from earlier releases, all lotus behavior:
//!
//! - Archidekt zones follow each card's primary category and that
//!   category's `includedInDeck` flag: a card whose primary category is
//!   excluded from the deck is kept as considering, and a secondary
//!   `Maybeboard`/`Sideboard` category no longer moves a card out of the
//!   deck (before: "Maybeboard" or "Sideboard" anywhere in the categories
//!   meant considering).
//! - Remote ManaVault deck cards clamp their quantity to at least one, and
//!   an unknown zone string reads as the main deck (before: both were kept
//!   as sent).
//! - HTTP 401 is treated like 403 (Moxfield's "blocked" message) instead
//!   of a generic HTTP error.
//! - A remote ManaVault answer of HTTP 404, or `data` without the `deck`
//!   field, reads as "not found" (before: "couldn't reach").

use lotus::decklist::{Allowlist, DecklistClient, FetchError, Origin, ShareKind, ShareLink};

use crate::config::Config;
use crate::trade::list_source::{ListEntry, ResolvedList, UNSUPPORTED};

/// `User-Agent` for list imports (`ListSource.Http`).
pub const USER_AGENT: &str = "ManaVault/0.1 (+trade-list-import)";

pub const MOXFIELD_ERROR: &str =
    "Couldn't fetch that Moxfield deck (it may be private). Paste the deck export text instead.";
pub const MOXFIELD_FORBIDDEN: &str = "Moxfield blocked the request — their API only serves approved apps. \
     Use Moxfield's Export > Copy and paste the list instead.";
pub const ARCHIDEKT_ERROR: &str =
    "Couldn't fetch that Archidekt deck (it may be private). Paste the deck export text instead.";
pub const DECK_NOT_FOUND: &str = "That share link doesn't match a deck on that ManaVault instance. \
     Paste the list text instead.";
pub const WANTS_NOT_FOUND: &str = "That share link doesn't match a shared want list on that ManaVault \
     instance. Paste the list text instead.";
pub const BINDER_NOT_FOUND: &str = "That share link doesn't match a shared trade binder on that \
     ManaVault instance. Paste the list text instead.";
pub const UNREACHABLE: &str = "Couldn't reach that ManaVault instance to fetch the shared list. \
     Paste the list text instead.";
pub const LIMIT: &str =
    "That shared list is too large or took too long to import. Paste the list text instead.";
pub const PAGINATION: &str =
    "That ManaVault instance returned invalid list pagination. Paste the list text instead.";
pub const WANTS_UNSUPPORTED: &str = "That ManaVault instance doesn't support shared want lists yet. \
     Paste the list text instead.";
/// The remote ManaVault predates the share query (lotus
/// `FetchError::ServerTooOld`, `MIN_SERVER_VERSION`). Requiring v1.3.0+ is a
/// product decision; there is no fallback query for older instances.
pub const SERVER_TOO_OLD: &str = "That ManaVault instance is too old to share decks with this one \
     (needs ManaVault v1.3.0 or newer). Ask its owner to update, or paste the list text instead.";
pub const BINDER_UNSUPPORTED: &str = "That ManaVault instance doesn't support shared trade binders \
     yet. Paste the list text instead.";

/// The list-import client for this configuration: the Moxfield and
/// Archidekt API bases from [`Config::platform_urls`] and the operator's
/// non-public ManaVault destinations from `MANAVAULT_REMOTE_SHARE_ALLOWLIST`.
pub fn client(config: &Config) -> Result<DecklistClient, FetchError> {
    builder(config).build()
}

/// The client builder for this configuration, for callers (and tests) that
/// adjust it further, such as with a stub DNS resolver.
#[must_use]
pub fn builder(config: &Config) -> lotus::decklist::DecklistClientBuilder {
    DecklistClient::builder(USER_AGENT)
        .allowlist(Allowlist::parse(
            config.remote_share_allowlist.iter().map(String::as_str),
        ))
        .moxfield_api_base(config.platform_urls.moxfield_api.clone())
        .archidekt_api_base(config.platform_urls.archidekt_api.clone())
}

fn entries(list: lotus::decklist::Decklist) -> ResolvedList {
    ResolvedList {
        source_name: list.name,
        entries: list
            .entries
            .into_iter()
            .map(|entry| ListEntry {
                name: entry.name,
                quantity: entry.quantity.as_i64(),
                zone: entry.zone,
                set_code: entry.set_code,
                collector_number: entry.collector_number,
            })
            .collect(),
    }
}

/// Fetches a Moxfield deck by validated id (`Moxfield.fetch/1`).
pub async fn moxfield(client: &DecklistClient, id: &str) -> Result<ResolvedList, &'static str> {
    client
        .fetch_moxfield(id)
        .await
        .map(entries)
        .map_err(|error| match error {
            FetchError::Forbidden => MOXFIELD_FORBIDDEN,
            _ => MOXFIELD_ERROR,
        })
}

/// Fetches an Archidekt deck by validated id (`Archidekt.fetch/1`).
pub async fn archidekt(client: &DecklistClient, id: &str) -> Result<ResolvedList, &'static str> {
    client
        .fetch_archidekt(id)
        .await
        .map(entries)
        .map_err(|_| ARCHIDEKT_ERROR)
}

/// Fetches a share from another ManaVault instance (`ManaVaultRemote.fetch/3`).
pub async fn manavault(
    client: &DecklistClient,
    origin: &Origin,
    share: &ShareLink,
) -> Result<ResolvedList, &'static str> {
    client
        .fetch_manavault(origin, share)
        .await
        .map(entries)
        .map_err(|error| manavault_error(share.kind, &error))
}

/// The user-facing message for a ManaVault fetch failure.
#[must_use]
pub fn manavault_error(kind: ShareKind, error: &FetchError) -> &'static str {
    match error {
        FetchError::UnsupportedLink | FetchError::BlockedDestination => UNSUPPORTED,
        FetchError::NotFound => match kind {
            ShareKind::Deck => DECK_NOT_FOUND,
            ShareKind::Wants => WANTS_NOT_FOUND,
            ShareKind::Binder => BINDER_NOT_FOUND,
        },
        FetchError::LimitExceeded | FetchError::BodyTooLarge => LIMIT,
        FetchError::InvalidPagination => PAGINATION,
        FetchError::ServerTooOld => SERVER_TOO_OLD,
        FetchError::Unsupported(ShareKind::Wants) => WANTS_UNSUPPORTED,
        FetchError::Unsupported(ShareKind::Binder) => BINDER_UNSUPPORTED,
        FetchError::Unsupported(ShareKind::Deck)
        | FetchError::Forbidden
        | FetchError::HttpStatus(_)
        | FetchError::Timeout
        | FetchError::RequestFailed
        | FetchError::InvalidJson
        | FetchError::Malformed
        | FetchError::GraphqlErrors(_) => UNREACHABLE,
    }
}
