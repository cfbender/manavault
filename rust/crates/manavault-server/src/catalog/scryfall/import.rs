//! Writes Scryfall cards into `scryfall_cards`, `scryfall_printings`, and
//! `scryfall_card_tokens` (`Manavault.Catalog.Scryfall.Import`).
//!
//! PLACEHOLDER: a minimal upsert so tests can load fixtures. The full port
//! (oracle tag fields, diffing, batching, reconcile) replaces it.

use lotus::scryfall::ScryfallCard;
use lotus::scryfall::catalog::is_bare_card;
use sqlx::SqlitePool;

use crate::timefmt;

/// Counts reported by an import.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct ImportCounts {
    pub cards_count: usize,
    pub printings_count: usize,
}

fn excluded(card: &ScryfallCard) -> bool {
    lotus::scryfall::catalog::is_non_game_insert(card)
        || (!card.is_token()
            && (is_bare_card(card.type_line.as_deref())
                || card.set_type.as_deref().is_some_and(|set_type| {
                    lotus::scryfall::catalog::EXCLUDED_SET_TYPES.contains(&set_type)
                })))
}

fn json<T: serde::Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "null".to_owned())
}

/// Upserts cards and printings.
pub async fn import_cards(
    pool: &SqlitePool,
    cards: Vec<ScryfallCard>,
) -> Result<ImportCounts, sqlx::Error> {
    let now = timefmt::now();
    let mut counts = ImportCounts::default();
    let mut tx = crate::db::begin_write(pool).await?;
    for card in cards.into_iter().filter(|card| !excluded(card)) {
        let card = card.with_face_identity();
        let Some(oracle_id) = card.oracle_id.clone() else {
            continue;
        };
        sqlx::query(
            "INSERT INTO scryfall_cards (oracle_id, name, normalized_name, layout, type_line, oracle_text, mana_cost, cmc, colors, color_identity, legalities, game_changer, edhrec_rank, oracle_tags, deck_category, deck_themes, rulings_uri, inserted_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, '[]', NULL, '[]', ?14, ?15, ?15)
             ON CONFLICT (oracle_id) DO UPDATE SET name = excluded.name, normalized_name = excluded.normalized_name, layout = excluded.layout,
               type_line = excluded.type_line, oracle_text = excluded.oracle_text, mana_cost = excluded.mana_cost, cmc = excluded.cmc,
               colors = excluded.colors, color_identity = excluded.color_identity, legalities = excluded.legalities,
               game_changer = excluded.game_changer, edhrec_rank = excluded.edhrec_rank, rulings_uri = excluded.rulings_uri,
               oracle_tags = excluded.oracle_tags, deck_category = excluded.deck_category, deck_themes = excluded.deck_themes,
               updated_at = excluded.updated_at",
        )
        .bind(oracle_id.as_str())
        .bind(&card.name)
        .bind(lotus::normalize_name(&card.name))
        .bind(&card.layout)
        .bind(&card.type_line)
        .bind(card.full_oracle_text())
        .bind(&card.mana_cost)
        .bind(card.cmc)
        .bind(json(&card.front_colors()))
        .bind(json(&card.color_identity))
        .bind(json(&card.legalities))
        .bind(card.game_changer)
        .bind(card.edhrec_rank)
        .bind(&card.rulings_uri)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
        counts.cards_count += 1;

        let image_uris = match &card.image_uris {
            Some(uris) => json(uris),
            None if card.card_faces.is_empty() => "{}".to_owned(),
            None => json(&card.all_image_uris()),
        };
        let flavor_name = card.full_flavor_name();
        sqlx::query(
            "INSERT INTO scryfall_printings (scryfall_id, oracle_id, set_code, set_name, collector_number, illustration_id, lang, flavor_name, normalized_flavor_name, flavor_text, rarity, finishes, promo_types, promo, image_uris, prices, released_at, tcgplayer_id, tcgplayer_etched_id, inserted_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?20)
             ON CONFLICT (scryfall_id) DO UPDATE SET oracle_id = excluded.oracle_id, set_code = excluded.set_code, set_name = excluded.set_name,
               collector_number = excluded.collector_number, illustration_id = excluded.illustration_id, lang = excluded.lang,
               flavor_name = excluded.flavor_name, normalized_flavor_name = excluded.normalized_flavor_name, flavor_text = excluded.flavor_text,
               rarity = excluded.rarity, finishes = excluded.finishes, promo_types = excluded.promo_types, promo = excluded.promo,
               image_uris = excluded.image_uris, prices = excluded.prices, released_at = excluded.released_at,
               tcgplayer_id = excluded.tcgplayer_id, tcgplayer_etched_id = excluded.tcgplayer_etched_id, updated_at = excluded.updated_at",
        )
        .bind(card.id.as_str())
        .bind(oracle_id.as_str())
        .bind(card.set.to_lowercase())
        .bind(&card.set_name)
        .bind(&card.collector_number)
        .bind(card.any_illustration_id())
        .bind(card.lang.as_deref().unwrap_or("en"))
        .bind(&flavor_name)
        .bind(flavor_name.as_deref().map(lotus::normalize_name))
        .bind(card.full_flavor_text())
        .bind(card.rarity.map(lotus::Rarity::as_str))
        .bind(json(&card.finishes))
        .bind(json(&card.promo_types))
        .bind(card.promo)
        .bind(image_uris)
        .bind(json(&card.prices))
        .bind(card.released_at.map(|date| date.to_string()))
        .bind(card.tcgplayer_id.and_then(|id| i64::try_from(id).ok()))
        .bind(card.tcgplayer_etched_id.and_then(|id| i64::try_from(id).ok()))
        .bind(&now)
        .execute(&mut *tx)
        .await?;
        counts.printings_count += 1;
    }
    tx.commit().await?;
    Ok(counts)
}
