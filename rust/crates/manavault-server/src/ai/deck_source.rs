//! Resolving pasted decklist text or a supported deck link into named
//! entries for list analysis (the parts of `Trade.Lists.resolve/1` and
//! `Catalog.Decklists.parse/2` that `AnalyzeDeckList` uses).
//!
//! Links go through lotus: [`DeckLink`] recognizes them and
//! [`DecklistClient`] fetches Moxfield, Archidekt, and other ManaVault
//! instances' share links. A host-less `/share/decks/<token>` link resolves
//! locally with no request.
//!
//! TODO(integration): the trade port owns `Trade.ListSource` (including
//! local `/share/wants` and `/share/binder` links, which this module reports
//! as unsupported) and the decks port owns `Decklists.parse`; switch to
//! theirs once merged.

use std::collections::HashMap;
use std::sync::LazyLock;

use lotus::decklist::{Allowlist, DeckLink, DecklistClient, FetchError, ShareKind};
use regex::Regex;
use sqlx::SqlitePool;

use crate::ai::decks;
use crate::catalog::search::cards_by_name::normalize_card_name;
use crate::catalog::search::printings::get_printing;
use crate::state::AppState;

const UNSUPPORTED: &str = "Unsupported link. Paste the list text instead.";
const LOCAL_DECK_NOT_FOUND: &str = "That share link doesn't match a deck on this ManaVault instance. If it came from another vault, paste the list text instead.";
const REMOTE_DECK_NOT_FOUND: &str =
    "That share link doesn't match a deck on that ManaVault instance. Paste the list text instead.";
const REMOTE_WANTS_NOT_FOUND: &str = "That share link doesn't match a shared want list on that ManaVault instance. Paste the list text instead.";
const REMOTE_BINDER_NOT_FOUND: &str = "That share link doesn't match a shared trade binder on that ManaVault instance. Paste the list text instead.";
const REMOTE_UNREACHABLE: &str =
    "Couldn't reach that ManaVault instance to fetch the shared list. Paste the list text instead.";
const REMOTE_LIMIT: &str =
    "That shared list is too large or took too long to import. Paste the list text instead.";
const REMOTE_PAGINATION: &str =
    "That ManaVault instance returned invalid list pagination. Paste the list text instead.";
const REMOTE_WANTS_UNSUPPORTED: &str =
    "That ManaVault instance doesn't support shared want lists yet. Paste the list text instead.";
const REMOTE_BINDER_UNSUPPORTED: &str = "That ManaVault instance doesn't support shared trade binders yet. Paste the list text instead.";
const MOXFIELD_FAILED: &str =
    "Couldn't fetch that Moxfield deck (it may be private). Paste the deck export text instead.";
const MOXFIELD_FORBIDDEN: &str = "Moxfield blocked the request — their API only serves approved apps. Use Moxfield's Export > Copy and paste the list instead.";
const ARCHIDEKT_FAILED: &str =
    "Couldn't fetch that Archidekt deck (it may be private). Paste the deck export text instead.";
const USER_AGENT: &str = "ManaVault/0.1 (+trade-list-import)";

/// One decklist line: a name, a count, and a zone name.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceEntry {
    pub name: String,
    pub quantity: i64,
    pub zone: String,
}

/// A resolved list.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedList {
    /// The deck's name when the source has one.
    pub source_name: Option<String>,
    pub entries: Vec<SourceEntry>,
}

static LINE_BREAK: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new("\r\n|[\n\u{0B}\u{0C}\r\u{85}\u{2028}\u{2029}]").ok());
static COMMENT: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"\s+#.*$").ok());
static CARD_LINE: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"(?i)^\s*(?:(?<quantity>\d+)\s*x?\s+)?(?<name>.+?)\s*$").ok());
static PRINTING: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"^(.+?)\s+\(([A-Za-z0-9]+)\)\s+(\S+)\s*$").ok());
static FOIL: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"(?i)\*F\*\s*$").ok());
static ETCHED: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"(?i)\*E\*\s*$").ok());

fn matches(pattern: &LazyLock<Option<Regex>>, text: &str) -> bool {
    pattern
        .as_ref()
        .is_some_and(|pattern| pattern.is_match(text))
}

fn zone_heading(line: &str) -> Option<&'static str> {
    match line.to_lowercase().trim_end_matches(':') {
        "main" | "mainboard" | "deck" => Some("mainboard"),
        "side" | "sideboard" | "maybe" | "maybeboard" | "considering" => Some("considering"),
        "commander" | "commanders" => Some("commander"),
        _ => None,
    }
}

/// `Util.parse_quantity/1` for digits: the number, or 1 when it does not fit.
fn parse_quantity(digits: &str) -> i64 {
    digits.parse().unwrap_or(1)
}

struct ParsedLine {
    name: String,
    quantity: i64,
    zone: &'static str,
    finish: &'static str,
    printing_id: Option<String>,
}

async fn parse_card_line(
    pool: &SqlitePool,
    line: &str,
    zone: &'static str,
) -> Result<Option<ParsedLine>, sqlx::Error> {
    let (line, zone) = match line.strip_prefix("SB:") {
        Some(rest) => (rest.trim(), "considering"),
        None => (line, zone),
    };
    let Some(captures) = CARD_LINE
        .as_ref()
        .and_then(|pattern| pattern.captures(line))
    else {
        return Ok(None);
    };
    let Some(name) = captures.name("name") else {
        return Ok(None);
    };
    let quantity = captures
        .name("quantity")
        .map_or(1, |digits| parse_quantity(digits.as_str()));
    let cleaned = normalize_card_name(name.as_str());
    let printed = PRINTING
        .as_ref()
        .and_then(|pattern| pattern.captures(&cleaned))
        .and_then(|captures| {
            Some((
                captures.get(1)?.as_str().to_owned(),
                captures.get(2)?.as_str().to_owned(),
                captures.get(3)?.as_str().to_owned(),
            ))
        });
    let (name, printing_id) = match printed {
        Some((card_name, set_code, collector_number)) => {
            let printing = get_printing(pool, &set_code, &collector_number).await?;
            (
                normalize_card_name(&card_name),
                printing.map(|printing| printing.scryfall_id.as_ref().to_owned()),
            )
        }
        None => (cleaned, None),
    };
    let finish = if matches(&FOIL, line) {
        "foil"
    } else if matches(&ETCHED, line) {
        "etched"
    } else {
        "nonfoil"
    };
    Ok(Some(ParsedLine {
        name,
        quantity,
        zone,
        finish,
        printing_id,
    }))
}

/// `Decklists.parse/1`: entries in first-seen order, merging duplicates of
/// the same name, zone, printing, and finish (keeping the larger count).
pub async fn parse_text(pool: &SqlitePool, text: &str) -> Result<Vec<SourceEntry>, sqlx::Error> {
    let lines: Vec<&str> = match LINE_BREAK.as_ref() {
        Some(pattern) => pattern.split(text).collect(),
        None => text.lines().collect(),
    };
    let mut zone = "mainboard";
    let mut parsed: Vec<ParsedLine> = Vec::new();
    for line in lines {
        let line = line.trim();
        let line = match COMMENT.as_ref() {
            Some(pattern) => pattern.replace(line, "").trim().to_owned(),
            None => line.to_owned(),
        };
        if line.is_empty() {
            continue;
        }
        if let Some(heading) = zone_heading(&line) {
            zone = heading;
            continue;
        }
        if let Some(entry) = parse_card_line(pool, &line, zone).await? {
            parsed.push(entry);
        }
    }
    let mut order: Vec<(String, &'static str, Option<String>, &'static str)> = Vec::new();
    let mut merged: HashMap<(String, &'static str, Option<String>, &'static str), ParsedLine> =
        HashMap::new();
    for entry in parsed {
        let key = (
            entry.name.to_lowercase(),
            entry.zone,
            entry.printing_id.clone(),
            entry.finish,
        );
        if let Some(existing) = merged.get_mut(&key) {
            existing.quantity = existing.quantity.max(entry.quantity);
        } else {
            order.push(key.clone());
            merged.insert(key, entry);
        }
    }
    Ok(order
        .into_iter()
        .filter_map(|key| merged.remove(&key))
        .map(|entry| SourceEntry {
            name: entry.name,
            quantity: entry.quantity,
            zone: entry.zone.to_owned(),
        })
        .collect())
}

fn remote_error(kind: ShareKind, error: &FetchError) -> &'static str {
    match (error, kind) {
        (FetchError::NotFound, ShareKind::Deck) => REMOTE_DECK_NOT_FOUND,
        (FetchError::NotFound, ShareKind::Wants) => REMOTE_WANTS_NOT_FOUND,
        (FetchError::NotFound, ShareKind::Binder) => REMOTE_BINDER_NOT_FOUND,
        (FetchError::LimitExceeded, _) => REMOTE_LIMIT,
        (FetchError::InvalidPagination, _) => REMOTE_PAGINATION,
        (FetchError::Unsupported(ShareKind::Wants), _) => REMOTE_WANTS_UNSUPPORTED,
        (FetchError::Unsupported(ShareKind::Binder), _) => REMOTE_BINDER_UNSUPPORTED,
        (FetchError::UnsupportedLink | FetchError::BlockedDestination, _) => UNSUPPORTED,
        _ => REMOTE_UNREACHABLE,
    }
}

fn client(state: &AppState) -> Result<DecklistClient, String> {
    DecklistClient::builder(USER_AGENT)
        .allowlist(Allowlist::parse(
            state
                .config
                .remote_share_allowlist
                .iter()
                .map(String::as_str),
        ))
        .build()
        .map_err(|_| UNSUPPORTED.to_owned())
}

async fn local_deck(
    state: &AppState,
    token: &str,
) -> Result<Result<ResolvedList, String>, sqlx::Error> {
    let Some(deck) = decks::by_share_token(&state.db, token).await? else {
        return Ok(Err(LOCAL_DECK_NOT_FOUND.to_owned()));
    };
    let entries = decks::deck_cards(&state.db, deck.id)
        .await?
        .into_iter()
        .map(|card| SourceEntry {
            name: card.card.name,
            quantity: card.quantity,
            zone: card.zone.as_str().to_owned(),
        })
        .collect();
    Ok(Ok(ResolvedList {
        source_name: Some(deck.name),
        entries,
    }))
}

/// Resolves a trimmed deck link (`ListSource.from_url/1`). The inner error
/// is a user-facing message.
pub async fn resolve_url(
    state: &AppState,
    url: &str,
) -> Result<Result<ResolvedList, String>, sqlx::Error> {
    let Ok(link) = DeckLink::parse(url) else {
        return Ok(Err(UNSUPPORTED.to_owned()));
    };
    let fetched = match &link {
        DeckLink::ManaVault {
            origin: None,
            share,
        } => {
            return match share.kind {
                ShareKind::Deck => local_deck(state, &share.token).await,
                // TODO(integration): local want lists and trade binders.
                ShareKind::Wants | ShareKind::Binder => Ok(Err(UNSUPPORTED.to_owned())),
            };
        }
        DeckLink::Other { .. } => return Ok(Err(UNSUPPORTED.to_owned())),
        _ => match client(state) {
            Ok(client) => client.fetch(&link).await,
            Err(message) => return Ok(Err(message)),
        },
    };
    let decklist = match (fetched, &link) {
        (Ok(decklist), _) => decklist,
        (Err(FetchError::Forbidden), DeckLink::Moxfield { .. }) => {
            return Ok(Err(MOXFIELD_FORBIDDEN.to_owned()));
        }
        (Err(_), DeckLink::Moxfield { .. }) => return Ok(Err(MOXFIELD_FAILED.to_owned())),
        (Err(_), DeckLink::Archidekt { .. }) => return Ok(Err(ARCHIDEKT_FAILED.to_owned())),
        (Err(error), DeckLink::ManaVault { share, .. }) => {
            return Ok(Err(remote_error(share.kind, &error).to_owned()));
        }
        (Err(_), DeckLink::Other { .. }) => return Ok(Err(UNSUPPORTED.to_owned())),
    };
    Ok(Ok(ResolvedList {
        source_name: decklist.name,
        entries: decklist
            .entries
            .into_iter()
            .map(|entry| SourceEntry {
                name: entry.name,
                quantity: entry.quantity.as_i64(),
                zone: entry.zone.as_str().to_owned(),
            })
            .collect(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{TestApp, fixtures};

    fn entry(name: &str, quantity: i64, zone: &str) -> SourceEntry {
        SourceEntry {
            name: name.into(),
            quantity,
            zone: zone.into(),
        }
    }

    #[tokio::test]
    async fn parses_zones_quantities_comments_and_duplicates() {
        let app = TestApp::new().await;
        app.import_cards(&[fixtures::black_lotus()]).await;
        let text = "Commander\n1 Test Commander\r\n\nMainboard:\n2x Plains # basics\n3 plains\n4 Black Lotus (LEA) 232\nSol Ring *F*\nSB: Island\nMaybe\n1 Opt [M21]";
        let entries = parse_text(app.db(), text).await.unwrap();
        assert_eq!(
            entries,
            vec![
                entry("Test Commander", 1, "commander"),
                entry("Plains", 3, "mainboard"),
                entry("Black Lotus", 4, "mainboard"),
                entry("Sol Ring", 1, "mainboard"),
                entry("Island", 1, "considering"),
                entry("Opt", 1, "considering"),
            ]
        );
    }

    #[tokio::test]
    async fn rejects_unsupported_links_and_unknown_local_shares() {
        let app = TestApp::new().await;
        for url in [
            "https://example.com/decks/1",
            "/decks/123",
            "not a url",
            "/share/wants/abc",
        ] {
            assert_eq!(
                resolve_url(&app.state, url).await.unwrap(),
                Err(UNSUPPORTED.to_owned()),
                "{url}"
            );
        }
        assert_eq!(
            resolve_url(&app.state, "/share/decks/missing-token")
                .await
                .unwrap(),
            Err(LOCAL_DECK_NOT_FOUND.to_owned())
        );
    }
}
