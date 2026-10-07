//! A deck's cards with their catalog data, and the summaries derived from
//! them (`Decks.Queries`, `DeckSummaries`, `Decks.Statistics`).

use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::sync::Arc;

use lotus::{OracleId, ScryfallId, Zone};
use sqlx::SqlitePool;

use crate::catalog::card::CardRecord;
use crate::catalog::printing::Printing;
use crate::catalog::sql::json_list;
use crate::decks::commander::chooses_color_before_game;
use crate::decks::legality::{self, DeckLegality, LegalityCard};
use crate::decks::model::{
    DeckCardId, DeckCardRow, DeckFormat, DeckId, counted_quantity, counts_toward_deck, id_list,
};

/// A deck card with its card, preferred printing, and fallback printing
/// (the newest printing of the card).
#[derive(Debug, Clone)]
pub struct LoadedDeckCard {
    pub row: DeckCardRow,
    pub card: Arc<CardRecord>,
    pub preferred_printing: Option<Printing>,
    pub fallback_printing: Option<Printing>,
}

/// Every card of a deck, ordered by zone, card name, and id
/// (`Decks.Preloads.deck_preloads/0`).
#[derive(Debug, Clone, Default)]
pub struct DeckContents {
    pub cards: Vec<LoadedDeckCard>,
}

/// The list-page facts about a deck (`DeckSummaries.put_fields/1`): counts
/// of cards that count toward the deck, the commanders' color identity, and
/// the cover image.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckSummary {
    pub card_count: u32,
    pub unique_card_count: u32,
    /// `None` without commanders; `["C"]` for colorless commanders.
    pub commander_color_identity: Option<Vec<String>>,
    pub cover_image_url: Option<String>,
}

impl DeckContents {
    /// The rows, in deck order.
    pub fn rows(&self) -> impl Iterator<Item = &DeckCardRow> {
        self.cards.iter().map(|card| &card.row)
    }

    /// `DeckLegality.evaluate/1`.
    #[must_use]
    pub fn legality(&self, format: DeckFormat) -> DeckLegality {
        let cards: Vec<LegalityCard<'_>> = self
            .cards
            .iter()
            .map(|card| LegalityCard {
                oracle_id: &card.row.oracle_id,
                zone: card.row.zone,
                quantity: card.row.quantity.get(),
                card: Some(&card.card),
            })
            .collect();
        legality::evaluate(format, &cards)
    }

    /// The deck summary, using `cover_deck_card_id` as the chosen cover.
    #[must_use]
    pub fn summary(&self, cover_deck_card_id: Option<DeckCardId>) -> DeckSummary {
        DeckSummary {
            card_count: counted_quantity(self.rows()),
            unique_card_count: u32::try_from(
                self.rows().filter(|row| row.counts_toward_deck()).count(),
            )
            .unwrap_or(u32::MAX),
            commander_color_identity: commander_color_identity(&self.cards),
            cover_image_url: cover_image_url(&self.cards, cover_deck_card_id),
        }
    }

    /// `Decks.Statistics.deck_stats/1`.
    #[must_use]
    pub fn stats(&self) -> DeckStats {
        let mut zones: BTreeMap<&'static str, u32> = BTreeMap::new();
        let mut types: BTreeMap<&'static str, u32> = BTreeMap::new();
        let mut colors: BTreeMap<String, u32> = ["W", "U", "B", "R", "G", "C"]
            .into_iter()
            .map(|color| (color.to_owned(), 0))
            .collect();
        for card in &self.cards {
            let quantity = card.row.quantity.get();
            add(zones.entry(card.row.zone.as_str()).or_default(), quantity);
            add(types.entry(card_type(&card.card)).or_default(), quantity);
            let identity = crate::catalog::json::strings(&card.card.color_identity);
            if identity.is_empty() {
                add(colors.entry("C".to_owned()).or_default(), quantity);
            }
            for color in identity {
                add(colors.entry(color).or_default(), quantity);
            }
        }
        DeckStats {
            total: counted_quantity(self.rows()),
            zones,
            colors,
            types,
        }
    }
}

fn add(total: &mut u32, quantity: u32) {
    *total = total.saturating_add(quantity);
}

/// Deck statistics: counted total and quantities per zone, color, and type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckStats {
    pub total: u32,
    pub zones: BTreeMap<&'static str, u32>,
    pub colors: BTreeMap<String, u32>,
    pub types: BTreeMap<&'static str, u32>,
}

/// `Card.sorting_type_line/1`: permanents use their front face.
#[must_use]
pub fn sorting_type_line(type_line: &str) -> &str {
    let front = type_line.split("//").next().unwrap_or(type_line).trim();
    let lower = front.to_lowercase();
    let permanent = [
        "artifact",
        "battle",
        "creature",
        "enchantment",
        "land",
        "planeswalker",
    ]
    .iter()
    .any(|word| {
        lower
            .split(|c: char| !c.is_alphanumeric())
            .any(|part| part == *word)
    });
    if permanent { front } else { type_line }
}

fn card_type(card: &CardRecord) -> &'static str {
    let Some(type_line) = card.type_line.as_deref() else {
        return "Other";
    };
    let type_line = sorting_type_line(type_line);
    [
        "Creature",
        "Land",
        "Instant",
        "Sorcery",
        "Artifact",
        "Enchantment",
        "Planeswalker",
    ]
    .into_iter()
    .find(|word| type_line.contains(word))
    .unwrap_or("Other")
}

fn present(url: Option<String>) -> Option<String> {
    url.filter(|url| !url.is_empty())
}

fn printing_cover(printing: Option<&Printing>) -> Option<String> {
    let printing = printing?;
    present(printing.art_crop_url()).or_else(|| present(printing.image_url()))
}

fn card_cover(card: &LoadedDeckCard) -> Option<String> {
    printing_cover(card.preferred_printing.as_ref())
        .or_else(|| printing_cover(card.fallback_printing.as_ref()))
}

/// `DeckSummaries.cover_image_url_from_cards/2`: the chosen cover card's
/// image, else the first card with an image (commanders sort first).
#[must_use]
pub fn cover_image_url(
    cards: &[LoadedDeckCard],
    cover_deck_card_id: Option<DeckCardId>,
) -> Option<String> {
    cover_deck_card_id
        .and_then(|id| cards.iter().find(|card| card.row.id == id))
        .and_then(card_cover)
        .or_else(|| cards.iter().find_map(card_cover))
}

fn color_sort_value(color: &str) -> usize {
    ["W", "U", "B", "R", "G", "M", "C"]
        .iter()
        .position(|candidate| *candidate == color)
        .unwrap_or(99)
}

fn colors_of<'a>(cards: impl Iterator<Item = &'a LoadedDeckCard>) -> BTreeSet<String> {
    cards
        .flat_map(|card| crate::catalog::json::strings(&card.card.color_identity))
        .map(|color| color.to_uppercase())
        .collect()
}

/// `DeckSummaries.commander_color_identity_from_cards/1`. Commanders that
/// choose a color before the game each add one color, inferred from the
/// counted cards outside the commanders' printed identity.
#[must_use]
pub fn commander_color_identity(cards: &[LoadedDeckCard]) -> Option<Vec<String>> {
    let (commanders, others): (Vec<&LoadedDeckCard>, Vec<&LoadedDeckCard>) = cards
        .iter()
        .partition(|card| card.row.zone == Zone::Commander);
    if commanders.is_empty() {
        return None;
    }
    let printed = colors_of(commanders.iter().copied());
    let slots = commanders
        .iter()
        .filter(|card| chooses_color_before_game(card.card.oracle_text.as_deref()))
        .count();
    let extra: BTreeSet<String> = colors_of(
        others
            .iter()
            .copied()
            .filter(|card| counts_toward_deck(card.row.zone)),
    )
    .difference(&printed)
    .cloned()
    .collect();
    let mut colors = printed;
    if slots > 0 && extra.len() <= slots {
        colors.extend(extra);
    }
    if colors.is_empty() {
        return Some(vec!["C".to_owned()]);
    }
    let mut colors: Vec<String> = colors.into_iter().collect();
    colors.sort_by_key(|color| color_sort_value(color));
    Some(colors)
}

/// The newest printing of each card (released date descending, then set
/// code), keyed by oracle id (`DeckSummaries.put_fallback_printings/1`).
pub async fn fallback_printings(
    pool: &SqlitePool,
    oracle_ids: &[OracleId],
) -> Result<HashMap<OracleId, Printing>, sqlx::Error> {
    if oracle_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = json_list(oracle_ids);
    let records = crate::printing_query!(
        "WHERE p.scryfall_id IN (
           SELECT ranked.scryfall_id FROM (
             SELECT sp.scryfall_id, row_number() OVER (
               PARTITION BY sp.oracle_id ORDER BY sp.released_at DESC, sp.set_code ASC
             ) AS rn
             FROM scryfall_printings AS sp
             WHERE sp.oracle_id IN (SELECT value FROM json_each(?1))
           ) AS ranked WHERE ranked.rn = 1
         )",
        ids
    )
    .fetch_all(pool)
    .await?;
    Ok(records
        .into_iter()
        .map(|record| (record.oracle_id.clone(), Printing::from(record)))
        .collect())
}

fn unique<T: Clone + Ord>(values: impl Iterator<Item = T>) -> Vec<T> {
    let set: BTreeSet<T> = values.collect();
    set.into_iter().collect()
}

/// Attaches cards and printings to deck card rows. Rows whose card is
/// missing from the catalog are dropped (the Elixir preload inner-joins
/// the card).
pub async fn load_cards(
    pool: &SqlitePool,
    rows: Vec<DeckCardRow>,
) -> Result<Vec<LoadedDeckCard>, sqlx::Error> {
    let oracle_ids = unique(rows.iter().map(|row| row.oracle_id.clone()));
    let printing_ids: Vec<ScryfallId> = unique(
        rows.iter()
            .filter_map(|row| row.preferred_printing_id.clone()),
    );
    let cards: HashMap<OracleId, Arc<CardRecord>> =
        crate::catalog::card::load_records(pool, &oracle_ids)
            .await?
            .into_iter()
            .map(|card| (card.oracle_id.clone(), Arc::new(card)))
            .collect();
    let preferred = Printing::load_many(pool, &printing_ids).await?;
    let fallbacks = fallback_printings(pool, &oracle_ids).await?;
    Ok(rows
        .into_iter()
        .filter_map(|row| {
            let card = cards.get(&row.oracle_id)?.clone();
            let preferred_printing = row
                .preferred_printing_id
                .as_ref()
                .and_then(|id| preferred.get(id))
                .cloned();
            let fallback_printing = fallbacks
                .get(&row.oracle_id)
                .cloned()
                .map(|printing| printing.with_card(card.clone()));
            Some(LoadedDeckCard {
                row,
                card,
                preferred_printing,
                fallback_printing,
            })
        })
        .collect())
}

/// The cards of several decks, each in deck order, batched.
pub async fn load_contents(
    pool: &SqlitePool,
    deck_ids: &[DeckId],
) -> Result<HashMap<DeckId, Arc<DeckContents>>, sqlx::Error> {
    if deck_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = id_list(deck_ids.iter().map(|id| id.0));
    let rows = crate::deck_card_row_query!(
        "JOIN scryfall_cards AS c ON c.oracle_id = dc.oracle_id
         WHERE dc.deck_id IN (SELECT value FROM json_each(?1))
         ORDER BY dc.deck_id, dc.zone, c.name, dc.id",
        ids
    )
    .fetch_all(pool)
    .await?;
    let mut grouped: HashMap<DeckId, DeckContents> = deck_ids
        .iter()
        .map(|id| (*id, DeckContents::default()))
        .collect();
    for card in load_cards(pool, rows).await? {
        grouped
            .entry(card.row.deck_id)
            .or_default()
            .cards
            .push(card);
    }
    Ok(grouped
        .into_iter()
        .map(|(id, contents)| (id, Arc::new(contents)))
        .collect())
}

/// One deck's cards.
pub async fn load_deck_contents(
    pool: &SqlitePool,
    deck_id: DeckId,
) -> Result<Arc<DeckContents>, sqlx::Error> {
    Ok(load_contents(pool, &[deck_id])
        .await?
        .remove(&deck_id)
        .unwrap_or_default())
}

/// Summaries of several decks keyed by id, for the deck list, the
/// `/api/v1/decks` endpoint, and share previews. Unknown ids are absent.
pub async fn deck_summaries(
    pool: &SqlitePool,
    deck_ids: &[DeckId],
) -> Result<HashMap<DeckId, DeckSummary>, sqlx::Error> {
    if deck_ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = id_list(deck_ids.iter().map(|id| id.0));
    let covers = sqlx::query!(
        r#"SELECT id AS "id!: DeckId", cover_deck_card_id AS "cover?: DeckCardId"
           FROM decks WHERE id IN (SELECT value FROM json_each(?1))"#,
        ids
    )
    .fetch_all(pool)
    .await?;
    let contents = load_contents(pool, deck_ids).await?;
    Ok(covers
        .into_iter()
        .map(|deck| {
            let summary = contents.get(&deck.id).map_or_else(
                || DeckContents::default().summary(None),
                |contents| contents.summary(deck.cover),
            );
            (deck.id, summary)
        })
        .collect())
}
