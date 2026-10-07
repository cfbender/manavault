//! Narrows a batch of import rows to the ones whose stored data differs
//! (`Manavault.Catalog.Scryfall.ImportDiff`).
//!
//! Most of the catalog is identical from one daily bulk file to the next, and
//! every row the import skips is a row (and its index entries) SQLite never
//! has to rewrite while holding the database-wide write lock. The reads here
//! run outside the batch transaction: under WAL they never block, or wait
//! for, a writer.

use std::collections::{HashMap, HashSet};

use sqlx::{QueryBuilder, Row, SqlitePool};

use crate::catalog::scryfall::push_in_list;

use crate::catalog::oracle_tags::TagFields;
use crate::catalog::scryfall::rows::{
    CardCore, CardRow, PrintingFields, PrintingRow, Rows, TokenRow,
};

const LOOKUP_BATCH_SIZE: usize = 200;

/// The rows a batch has to write.
#[derive(Debug, Default)]
pub struct Changes {
    pub cards: Vec<CardRow>,
    pub printings: Vec<PrintingRow>,
    /// Printings whose token links changed; their links are replaced.
    pub relinked_scryfall_ids: Vec<String>,
    /// The new links of the relinked printings.
    pub card_tokens: Vec<TokenRow>,
}

impl Changes {
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.cards.is_empty() && self.printings.is_empty() && self.relinked_scryfall_ids.is_empty()
    }
}

fn unique_ids<'a>(ids: impl Iterator<Item = &'a str>) -> Vec<String> {
    let mut seen = HashSet::new();
    ids.filter(|id| seen.insert(*id))
        .map(str::to_owned)
        .collect()
}

struct StoredCard {
    core: CardCore,
    tags: TagFields,
}

async fn stored_cards(
    pool: &SqlitePool,
    ids: &[String],
) -> Result<HashMap<String, StoredCard>, sqlx::Error> {
    let mut stored = HashMap::new();
    for chunk in ids.chunks(LOOKUP_BATCH_SIZE) {
        let mut builder = QueryBuilder::new(
            "SELECT oracle_id, name, normalized_name, layout, type_line, oracle_text, mana_cost, CAST(cmc AS REAL) AS cmc, colors, color_identity, legalities, game_changer, edhrec_rank, oracle_tags, deck_category, deck_themes FROM scryfall_cards WHERE oracle_id IN",
        );
        push_in_list(&mut builder, chunk);
        for row in builder.build().fetch_all(pool).await? {
            stored.insert(
                row.try_get("oracle_id")?,
                StoredCard {
                    core: CardCore {
                        name: row.try_get("name")?,
                        normalized_name: row.try_get("normalized_name")?,
                        layout: row.try_get("layout")?,
                        type_line: row.try_get("type_line")?,
                        oracle_text: row.try_get("oracle_text")?,
                        mana_cost: row.try_get("mana_cost")?,
                        cmc: row.try_get("cmc")?,
                        colors: row.try_get("colors")?,
                        color_identity: row.try_get("color_identity")?,
                        legalities: row.try_get("legalities")?,
                        game_changer: row.try_get("game_changer")?,
                        edhrec_rank: row.try_get("edhrec_rank")?,
                    },
                    tags: TagFields {
                        oracle_tags: row.try_get("oracle_tags")?,
                        deck_category: row.try_get("deck_category")?,
                        deck_themes: row.try_get("deck_themes")?,
                    },
                },
            );
        }
    }
    Ok(stored)
}

async fn stored_printings(
    pool: &SqlitePool,
    ids: &[String],
) -> Result<HashMap<String, PrintingFields>, sqlx::Error> {
    let mut stored = HashMap::new();
    for chunk in ids.chunks(LOOKUP_BATCH_SIZE) {
        let mut builder = QueryBuilder::new(
            "SELECT scryfall_id, oracle_id, set_code, set_name, collector_number, illustration_id, lang, flavor_name, normalized_flavor_name, flavor_text, rarity, finishes, promo_types, promo, image_uris, prices, released_at, tcgplayer_id, tcgplayer_etched_id FROM scryfall_printings WHERE scryfall_id IN",
        );
        push_in_list(&mut builder, chunk);
        for row in builder.build().fetch_all(pool).await? {
            stored.insert(
                row.try_get("scryfall_id")?,
                PrintingFields {
                    oracle_id: row.try_get("oracle_id")?,
                    set_code: row.try_get("set_code")?,
                    set_name: row.try_get("set_name")?,
                    collector_number: row.try_get("collector_number")?,
                    illustration_id: row.try_get("illustration_id")?,
                    lang: row.try_get("lang")?,
                    flavor_name: row.try_get("flavor_name")?,
                    normalized_flavor_name: row.try_get("normalized_flavor_name")?,
                    flavor_text: row.try_get("flavor_text")?,
                    rarity: row.try_get("rarity")?,
                    finishes: row.try_get("finishes")?,
                    promo_types: row.try_get("promo_types")?,
                    promo: row.try_get("promo")?,
                    image_uris: row.try_get("image_uris")?,
                    prices: row.try_get("prices")?,
                    released_at: row.try_get("released_at")?,
                    tcgplayer_id: row.try_get("tcgplayer_id")?,
                    tcgplayer_etched_id: row.try_get("tcgplayer_etched_id")?,
                },
            );
        }
    }
    Ok(stored)
}

async fn stored_token_links(
    pool: &SqlitePool,
    ids: &[String],
) -> Result<HashMap<String, HashSet<String>>, sqlx::Error> {
    let mut stored: HashMap<String, HashSet<String>> = HashMap::new();
    for chunk in ids.chunks(LOOKUP_BATCH_SIZE) {
        let mut builder = QueryBuilder::new(
            "SELECT scryfall_id, token_scryfall_id FROM scryfall_card_tokens WHERE scryfall_id IN",
        );
        push_in_list(&mut builder, chunk);
        for row in builder.build().fetch_all(pool).await? {
            stored
                .entry(row.try_get("scryfall_id")?)
                .or_default()
                .insert(row.try_get("token_scryfall_id")?);
        }
    }
    Ok(stored)
}

/// The card and printing rows that differ from what is stored, plus the
/// printings whose token links changed together with their new link rows.
/// Oracle tag columns are compared only when the import replaces them.
pub async fn changes(
    pool: &SqlitePool,
    rows: Rows,
    replace_oracle_tag_fields: bool,
) -> Result<Changes, sqlx::Error> {
    let card_ids = unique_ids(rows.cards.iter().map(|row| row.oracle_id.as_str()));
    let stored = if card_ids.is_empty() {
        HashMap::new()
    } else {
        stored_cards(pool, &card_ids).await?
    };
    let cards = rows
        .cards
        .into_iter()
        .filter(|row| {
            stored.get(&row.oracle_id).is_none_or(|stored| {
                stored.core != row.core || (replace_oracle_tag_fields && stored.tags != row.tags)
            })
        })
        .collect();

    let printing_ids = unique_ids(rows.printings.iter().map(|row| row.scryfall_id.as_str()));
    let stored = if printing_ids.is_empty() {
        HashMap::new()
    } else {
        stored_printings(pool, &printing_ids).await?
    };
    let printings = rows
        .printings
        .into_iter()
        .filter(|row| {
            stored
                .get(&row.scryfall_id)
                .is_none_or(|stored| *stored != row.fields)
        })
        .collect();

    // Token links are compared per printing as sets, so a printing is
    // relinked (its links deleted and reinserted) only when Scryfall added
    // or dropped one.
    let printing_scryfall_ids = unique_ids(
        printing_ids
            .iter()
            .map(String::as_str)
            .chain(rows.card_tokens.iter().map(|row| row.scryfall_id.as_str())),
    );
    let stored_links = if printing_scryfall_ids.is_empty() {
        HashMap::new()
    } else {
        stored_token_links(pool, &printing_scryfall_ids).await?
    };
    let mut incoming: HashMap<&str, HashSet<String>> = HashMap::new();
    for row in &rows.card_tokens {
        incoming
            .entry(row.scryfall_id.as_str())
            .or_default()
            .insert(row.token_scryfall_id.clone());
    }
    let empty = HashSet::new();
    let relinked_scryfall_ids: Vec<String> = printing_scryfall_ids
        .into_iter()
        .filter(|id| {
            stored_links.get(id).unwrap_or(&empty) != incoming.get(id.as_str()).unwrap_or(&empty)
        })
        .collect();
    let relinked: HashSet<&str> = relinked_scryfall_ids.iter().map(String::as_str).collect();
    let card_tokens = rows
        .card_tokens
        .iter()
        .filter(|row| relinked.contains(row.scryfall_id.as_str()))
        .cloned()
        .collect();

    Ok(Changes {
        cards,
        printings,
        relinked_scryfall_ids,
        card_tokens,
    })
}
