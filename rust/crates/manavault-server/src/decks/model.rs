//! Deck rows (`Manavault.Catalog.Deck`, `DeckCard`, `DeckTag`,
//! `DefaultDeckTag`) and their fixed vocabularies.
//!
//! Every text column with a fixed set of values decodes into an enum, so a
//! value outside the Ecto `validate_inclusion` lists fails at the database
//! boundary instead of flowing through the deck rules as a string.

use std::collections::HashMap;

use lotus::{Finish, OracleId, Quantity, ScryfallId, Zone};
use serde::{Deserialize, Serialize};
use sqlx::{SqliteConnection, SqlitePool};

pub use manavault_allocation::{CollectionItemId, DeckCardId, DeckId, LocationId};

macro_rules! text_enum {
    ($(#[$meta:meta])* $name:ident { $($variant:ident => $text:literal),+ $(,)? }) => {
        $(#[$meta])*
        #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, sqlx::Type)]
        #[serde(rename_all = "snake_case")]
        #[sqlx(rename_all = "snake_case")]
        pub enum $name {
            $($variant),+
        }

        impl $name {
            /// Every value, in the Elixir list order.
            pub const ALL: &'static [Self] = &[$(Self::$variant),+];

            /// The stored text value.
            #[must_use]
            pub fn as_str(self) -> &'static str {
                match self {
                    $(Self::$variant => $text),+
                }
            }

            /// Parses a stored text value.
            #[must_use]
            pub fn parse(value: &str) -> Option<Self> {
                match value {
                    $($text => Some(Self::$variant),)+
                    _ => None,
                }
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(self.as_str())
            }
        }
    };
}

text_enum!(
    /// `Deck.formats/0`.
    DeckFormat {
        Commander => "commander",
        Standard => "standard",
        Pioneer => "pioneer",
        Modern => "modern",
        Legacy => "legacy",
        Vintage => "vintage",
        Pauper => "pauper",
        Limited => "limited",
        Casual => "casual",
    }
);

text_enum!(
    /// `Deck.statuses/0`. Archived decks are frozen.
    DeckStatus {
        Brewing => "brewing",
        Active => "active",
        Archived => "archived",
    }
);

text_enum!(
    /// `Deck.external_sources/0`: the sites a deck can be linked to.
    ExternalSource {
        Moxfield => "moxfield",
        Archidekt => "archidekt",
    }
);

text_enum!(
    /// `DeckCard.tags/0`: a user marker on a deck card.
    DeckCardTag {
        Getting => "getting",
        ConsiderCutting => "consider_cutting",
    }
);

/// Zones whose cards count toward the deck total (`DeckCard.deck_count_zones/0`).
#[must_use]
pub fn counts_toward_deck(zone: Zone) -> bool {
    zone.in_deck()
}

/// Parses a deck card zone exactly as `DeckCard.zones/0` lists them (no
/// legacy aliases, unlike [`Zone::parse`]).
#[must_use]
pub fn parse_zone(value: &str) -> Option<Zone> {
    match value {
        "mainboard" => Some(Zone::Mainboard),
        "commander" => Some(Zone::Commander),
        "considering" => Some(Zone::Considering),
        _ => None,
    }
}

/// A `decks` row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckRow {
    pub id: DeckId,
    pub name: String,
    pub format: DeckFormat,
    pub status: DeckStatus,
    pub included_for_play: bool,
    pub play_count: i64,
    pub skip_count: i64,
    pub last_played_at: Option<String>,
    pub primer: Option<String>,
    pub ai_analysis: Option<String>,
    pub ai_analysis_model: Option<String>,
    pub ai_analyzed_at: Option<String>,
    pub commander_bracket: Option<i64>,
    pub commander_bracket_estimate: Option<i64>,
    pub commander_bracket_rating: Option<String>,
    pub share_token: Option<String>,
    pub external_source: Option<ExternalSource>,
    pub external_id: Option<String>,
    pub external_url: Option<String>,
    pub external_synced_at: Option<String>,
    pub external_sync_error: Option<String>,
    pub cover_deck_card_id: Option<DeckCardId>,
    pub inserted_at: String,
    pub updated_at: String,
}

impl DeckRow {
    /// `Deck.linked?/1`.
    #[must_use]
    pub fn is_linked(&self) -> bool {
        self.external_source.is_some()
    }
}

/// Selects `decks` rows aliased `d` into [`DeckRow`]; the argument is the
/// rest of the query after `FROM decks AS d`.
#[macro_export]
macro_rules! deck_row_query {
    ($tail:literal $(, $arg:expr)* $(,)?) => {
        sqlx::query_as!(
            $crate::decks::model::DeckRow,
            r#"SELECT d.id AS "id!: crate::decks::model::DeckId", d.name AS "name!",
                 d.format AS "format!: crate::decks::model::DeckFormat",
                 d.status AS "status!: crate::decks::model::DeckStatus",
                 d.included_for_play AS "included_for_play!: bool",
                 d.play_count AS "play_count!", d.skip_count AS "skip_count!",
                 d.last_played_at, d.primer, d.ai_analysis, d.ai_analysis_model,
                 d.ai_analyzed_at, d.commander_bracket, d.commander_bracket_estimate,
                 d.commander_bracket_rating, d.share_token,
                 d.external_source AS "external_source?: crate::decks::model::ExternalSource",
                 d.external_id, d.external_url, d.external_synced_at, d.external_sync_error,
                 d.cover_deck_card_id AS "cover_deck_card_id?: crate::decks::model::DeckCardId",
                 d.inserted_at AS "inserted_at!", d.updated_at AS "updated_at!"
               FROM decks AS d "# + $tail
            $(, $arg)*
        )
    };
}

/// A `deck_cards` row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckCardRow {
    pub id: DeckCardId,
    pub deck_id: DeckId,
    pub oracle_id: OracleId,
    pub preferred_printing_id: Option<ScryfallId>,
    pub quantity: Quantity,
    pub proxy_quantity: u32,
    pub zone: Zone,
    pub finish: Finish,
    pub tag: Option<DeckCardTag>,
}

impl DeckCardRow {
    /// `DeckCard.counts_toward_deck_total?/1`.
    #[must_use]
    pub fn counts_toward_deck(&self) -> bool {
        counts_toward_deck(self.zone)
    }
}

/// Selects `deck_cards` rows aliased `dc` into [`DeckCardRow`]; the argument
/// is the rest of the query after `FROM deck_cards AS dc`.
#[macro_export]
macro_rules! deck_card_row_query {
    ($tail:literal $(, $arg:expr)* $(,)?) => {
        sqlx::query_as!(
            $crate::decks::model::DeckCardRow,
            r#"SELECT dc.id AS "id!: crate::decks::model::DeckCardId",
                 dc.deck_id AS "deck_id!: crate::decks::model::DeckId",
                 dc.oracle_id AS "oracle_id!: lotus::OracleId",
                 dc.preferred_printing_id AS "preferred_printing_id?: lotus::ScryfallId",
                 dc.quantity AS "quantity!: lotus::Quantity",
                 dc.proxy_quantity AS "proxy_quantity!: u32",
                 dc.zone AS "zone!: lotus::Zone", dc.finish AS "finish!: lotus::Finish",
                 dc.tag AS "tag?: crate::decks::model::DeckCardTag"
               FROM deck_cards AS dc "# + $tail
            $(, $arg)*
        )
    };
}

/// Total quantity of the cards that count toward the deck
/// (`DeckCard.counted_quantity/1`).
#[must_use]
pub fn counted_quantity<'a>(rows: impl IntoIterator<Item = &'a DeckCardRow>) -> u32 {
    rows.into_iter()
        .filter(|row| row.counts_toward_deck())
        .fold(0u32, |sum, row| sum.saturating_add(row.quantity.get()))
}

/// Loads one deck.
pub async fn load_deck(pool: &SqlitePool, id: DeckId) -> Result<Option<DeckRow>, sqlx::Error> {
    deck_row_query!("WHERE d.id = ?1", id)
        .fetch_optional(pool)
        .await
}

/// Decks by id, keyed by id.
pub async fn load_decks(
    pool: &SqlitePool,
    ids: &[DeckId],
) -> Result<HashMap<DeckId, DeckRow>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = id_list(ids.iter().map(|id| id.0));
    let rows = deck_row_query!("WHERE d.id IN (SELECT value FROM json_each(?1))", ids)
        .fetch_all(pool)
        .await?;
    Ok(rows.into_iter().map(|row| (row.id, row)).collect())
}

/// Loads one deck on a connection (inside a transaction).
pub async fn load_deck_on(
    conn: &mut SqliteConnection,
    id: DeckId,
) -> Result<Option<DeckRow>, sqlx::Error> {
    deck_row_query!("WHERE d.id = ?1", id)
        .fetch_optional(conn)
        .await
}

/// Loads one deck card.
pub async fn load_deck_card(
    pool: &SqlitePool,
    id: DeckCardId,
) -> Result<Option<DeckCardRow>, sqlx::Error> {
    deck_card_row_query!("WHERE dc.id = ?1", id)
        .fetch_optional(pool)
        .await
}

/// Loads one deck card on a connection.
pub async fn load_deck_card_on(
    conn: &mut SqliteConnection,
    id: DeckCardId,
) -> Result<Option<DeckCardRow>, sqlx::Error> {
    deck_card_row_query!("WHERE dc.id = ?1", id)
        .fetch_optional(conn)
        .await
}

/// Deck cards by id, keyed by id.
pub async fn load_deck_cards(
    conn: &mut SqliteConnection,
    ids: &[DeckCardId],
) -> Result<HashMap<DeckCardId, DeckCardRow>, sqlx::Error> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = id_list(ids.iter().map(|id| id.0));
    let rows = deck_card_row_query!("WHERE dc.id IN (SELECT value FROM json_each(?1))", ids)
        .fetch_all(conn)
        .await?;
    Ok(rows.into_iter().map(|row| (row.id, row)).collect())
}

/// Every card of a deck, unordered.
pub async fn deck_card_rows(
    conn: &mut SqliteConnection,
    deck_id: DeckId,
) -> Result<Vec<DeckCardRow>, sqlx::Error> {
    deck_card_row_query!("WHERE dc.deck_id = ?1 ORDER BY dc.id", deck_id)
        .fetch_all(conn)
        .await
}

/// A JSON array of integers for `json_each` parameters.
#[must_use]
pub fn id_list(ids: impl IntoIterator<Item = i64>) -> String {
    serde_json::to_string(&ids.into_iter().collect::<Vec<i64>>())
        .unwrap_or_else(|_| "[]".to_owned())
}

/// A `deck_tags` row with its card count (`DeckTag` with the virtual
/// `card_count`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckTagRow {
    pub id: i64,
    pub deck_id: DeckId,
    pub name: String,
    pub color: String,
    pub target_count: Option<i64>,
    pub position: i64,
    pub card_count: i64,
}

/// A `default_deck_tags` row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DefaultDeckTagRow {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub target_count: Option<i64>,
    pub position: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vocabularies_match_the_elixir_lists() {
        let formats: Vec<&str> = DeckFormat::ALL.iter().map(|f| f.as_str()).collect();
        assert_eq!(
            formats,
            vec![
                "commander",
                "standard",
                "pioneer",
                "modern",
                "legacy",
                "vintage",
                "pauper",
                "limited",
                "casual"
            ]
        );
        assert_eq!(
            DeckCardTag::parse("consider_cutting"),
            Some(DeckCardTag::ConsiderCutting)
        );
        assert_eq!(DeckCardTag::parse("maybe"), None);
        assert_eq!(parse_zone("sideboard"), None);
        assert_eq!(parse_zone("considering"), Some(Zone::Considering));
    }
}
