//! Catalog rows built from Scryfall cards
//! (`Manavault.Catalog.Scryfall.ImportRows`).

use lotus::scryfall::ScryfallCard;
use serde::Serialize;

use crate::catalog::oracle_tags::{self, OracleTagIndex, TagFields};

/// Card columns the import owns, other than the key, `rulings_uri`, and the
/// oracle tag columns. They are compared against the stored row to decide
/// whether the row needs writing; anything else on the table (EDHREC
/// commander ranks, saltiness, `inserted_at`) is left alone.
#[derive(Debug, Clone, PartialEq)]
pub struct CardCore {
    pub name: String,
    pub normalized_name: Option<String>,
    pub layout: Option<String>,
    pub type_line: Option<String>,
    pub oracle_text: Option<String>,
    pub mana_cost: Option<String>,
    pub cmc: Option<f64>,
    pub colors: String,
    pub color_identity: String,
    pub legalities: String,
    pub game_changer: bool,
    pub edhrec_rank: Option<i64>,
}

/// One `scryfall_cards` row.
#[derive(Debug, Clone, PartialEq)]
pub struct CardRow {
    pub oracle_id: String,
    pub core: CardCore,
    /// Embeds the printing id, so every printing of a card carries a
    /// different one; it is written but not compared.
    pub rulings_uri: Option<String>,
    pub tags: TagFields,
}

/// The `scryfall_printings` columns the import owns.
#[derive(Debug, Clone, PartialEq)]
pub struct PrintingFields {
    pub oracle_id: String,
    pub set_code: String,
    pub set_name: Option<String>,
    pub collector_number: String,
    pub illustration_id: Option<String>,
    pub lang: String,
    pub flavor_name: Option<String>,
    pub normalized_flavor_name: Option<String>,
    pub flavor_text: Option<String>,
    pub rarity: Option<String>,
    pub finishes: String,
    pub promo_types: String,
    pub promo: bool,
    pub image_uris: String,
    pub prices: String,
    pub released_at: Option<String>,
    pub tcgplayer_id: Option<i64>,
    pub tcgplayer_etched_id: Option<i64>,
}

/// One `scryfall_printings` row.
#[derive(Debug, Clone, PartialEq)]
pub struct PrintingRow {
    pub scryfall_id: String,
    pub fields: PrintingFields,
}

/// One `scryfall_card_tokens` link: a printing and a token it creates.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TokenRow {
    pub scryfall_id: String,
    pub token_scryfall_id: String,
}

/// The rows for one batch of cards.
#[derive(Debug, Default)]
pub struct Rows {
    pub cards: Vec<CardRow>,
    pub printings: Vec<PrintingRow>,
    pub card_tokens: Vec<TokenRow>,
}

/// JSON text with object keys sorted, as Jason wrote small maps.
fn json<T: Serialize>(value: &T) -> String {
    serde_json::to_value(value)
        .and_then(|value| serde_json::to_string(&value))
        .unwrap_or_else(|_| "null".to_owned())
}

/// Builds the rows for a batch of already-filtered cards. Cards without an
/// oracle id (even after taking a reversible card's identity from its first
/// face) get no card or printing row.
///
/// Multi-faced cards whose faces carry no Oracle text, flavor text, or
/// flavor name store `""` in those columns, as earlier releases did (they
/// joined an empty list of face values), so stored data is the same whichever
/// release imported it. lotus's `full_*` helpers return `None` for that case;
/// [`faces_text`] converts at this boundary. Single-faced cards without the
/// field stay `NULL`.
#[must_use]
pub fn rows(cards: Vec<ScryfallCard>, tag_index: &OracleTagIndex) -> Rows {
    let mut rows = Rows::default();
    for card in cards {
        let card = card.with_face_identity();
        for token in card.token_ids() {
            rows.card_tokens.push(TokenRow {
                scryfall_id: card.id.as_str().to_owned(),
                token_scryfall_id: token.as_str().to_owned(),
            });
        }
        let Some(oracle_id) = card.oracle_id.as_ref().map(|id| id.as_str().to_owned()) else {
            continue;
        };
        rows.cards.push(card_row(&card, &oracle_id, tag_index));
        rows.printings.push(printing_row(&card, oracle_id));
    }
    rows
}

/// A joined face value as earlier releases stored it: lotus's `None` for a card with
/// faces (none of which has the value) becomes `""`.
fn faces_text(card: &ScryfallCard, joined: Option<String>) -> Option<String> {
    match joined {
        None if !card.card_faces.is_empty() => Some(String::new()),
        joined => joined,
    }
}

fn card_row(card: &ScryfallCard, oracle_id: &str, tag_index: &OracleTagIndex) -> CardRow {
    CardRow {
        oracle_id: oracle_id.to_owned(),
        core: CardCore {
            name: card.name.clone(),
            normalized_name: Some(lotus::normalize_name(&card.name)),
            layout: card.layout.clone(),
            type_line: card.type_line.clone(),
            oracle_text: faces_text(card, card.full_oracle_text()),
            mana_cost: card.mana_cost.clone(),
            cmc: card.cmc,
            colors: json(&card.front_colors()),
            color_identity: json(&card.color_identity),
            legalities: json(&card.legalities),
            game_changer: card.game_changer,
            edhrec_rank: card.edhrec_rank.map(i64::from),
        },
        rulings_uri: card.rulings_uri.clone(),
        tags: oracle_tags::fields_for_card(Some(oracle_id), card.type_line.as_deref(), tag_index),
    }
}

fn image_uris(card: &ScryfallCard) -> String {
    match &card.image_uris {
        Some(uris) => json(uris),
        None if card.card_faces.is_empty() => "{}".to_owned(),
        None => json(&card.all_image_uris()),
    }
}

fn printing_row(card: &ScryfallCard, oracle_id: String) -> PrintingRow {
    let flavor_name = faces_text(card, card.full_flavor_name());
    PrintingRow {
        scryfall_id: card.id.as_str().to_owned(),
        fields: PrintingFields {
            oracle_id,
            set_code: card.set.to_lowercase(),
            set_name: card.set_name.clone(),
            collector_number: card.collector_number.clone(),
            illustration_id: card.any_illustration_id().map(str::to_owned),
            lang: card.lang.clone().unwrap_or_else(|| "en".to_owned()),
            normalized_flavor_name: flavor_name.as_deref().map(lotus::normalize_name),
            flavor_name,
            flavor_text: faces_text(card, card.full_flavor_text()),
            rarity: card.rarity.map(|rarity| rarity.as_str().to_owned()),
            finishes: json(&card.finishes),
            promo_types: json(&card.promo_types),
            promo: card.promo,
            image_uris: image_uris(card),
            prices: json(&card.prices),
            released_at: card.released_at.map(|date| date.to_string()),
            tcgplayer_id: card.tcgplayer_id.and_then(|id| i64::try_from(id).ok()),
            tcgplayer_etched_id: card
                .tcgplayer_etched_id
                .and_then(|id| i64::try_from(id).ok()),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn card(value: serde_json::Value) -> ScryfallCard {
        serde_json::from_value(value).unwrap()
    }

    #[test]
    fn json_columns_match_the_stored_encoding() {
        let rows = rows(
            vec![card(json!({
                "id": "p", "oracle_id": "o", "name": "Lim-Dûl's Vault",
                "colors": ["U", "B"], "color_identity": ["U", "B"],
                "legalities": {"vintage": "legal", "commander": "not_legal"},
                "finishes": ["nonfoil", "foil"],
                "image_uris": {"small": "s", "normal": "n", "large": "l", "png": "p", "art_crop": "a", "border_crop": "b"},
                "prices": {"usd": "1.00", "eur": null},
                "released_at": "1996-06-10", "set": "ALL", "collector_number": "1"
            }))],
            &OracleTagIndex::new(),
        );
        let card = &rows.cards[0];
        assert_eq!(card.core.normalized_name.as_deref(), Some("lim-duls vault"));
        assert_eq!(card.core.colors, r#"["U","B"]"#);
        assert_eq!(
            card.core.legalities,
            r#"{"commander":"not_legal","vintage":"legal"}"#
        );
        let printing = &rows.printings[0].fields;
        assert_eq!(printing.set_code, "all");
        assert_eq!(printing.lang, "en");
        assert_eq!(printing.finishes, r#"["nonfoil","foil"]"#);
        assert_eq!(
            printing.image_uris,
            r#"{"art_crop":"a","border_crop":"b","large":"l","normal":"n","png":"p","small":"s"}"#
        );
        assert_eq!(printing.prices, r#"{"eur":null,"usd":"1.00"}"#);
        assert_eq!(printing.released_at.as_deref(), Some("1996-06-10"));
    }

    #[test]
    fn faces_supply_images_text_and_flavor() {
        let rows = rows(
            vec![card(json!({
                "id": "p", "oracle_id": "o", "name": "A // B",
                "card_faces": [
                    {"name": "A", "oracle_text": "front", "flavor_name": "Fa", "image_uris": {"normal": "a"}, "colors": ["R"]},
                    {"name": "B", "oracle_text": "back", "image_uris": {"normal": "b"}}
                ]
            }))],
            &OracleTagIndex::new(),
        );
        assert_eq!(
            rows.cards[0].core.oracle_text.as_deref(),
            Some("front\n---\nback")
        );
        assert_eq!(rows.cards[0].core.colors, r#"["R"]"#);
        let printing = &rows.printings[0].fields;
        assert_eq!(printing.image_uris, r#"[{"normal":"a"},{"normal":"b"}]"#);
        assert_eq!(printing.flavor_name.as_deref(), Some("Fa"));
        assert_eq!(printing.normalized_flavor_name.as_deref(), Some("fa"));
        // No face has flavor text: "" like earlier releases, not NULL.
        assert_eq!(printing.flavor_text.as_deref(), Some(""));
    }

    /// `ImportRows.rows/3` stores `""` for every joined face value a
    /// multi-faced card lacks (as earlier releases did), and `NULL`
    /// when a single-faced card lacks it.
    #[test]
    fn missing_face_values_store_empty_strings_like_earlier_releases() {
        let rows = rows(
            vec![
                card(json!({"id": "p", "oracle_id": "o", "name": "A // B",
                    "card_faces": [{"name": "A"}, {"name": "B"}]})),
                card(json!({"id": "q", "oracle_id": "o2", "name": "C"})),
            ],
            &OracleTagIndex::new(),
        );
        let faced = &rows.printings[0].fields;
        assert_eq!(rows.cards[0].core.oracle_text.as_deref(), Some(""));
        assert_eq!(faced.flavor_text.as_deref(), Some(""));
        assert_eq!(faced.flavor_name.as_deref(), Some(""));
        assert_eq!(faced.normalized_flavor_name.as_deref(), Some(""));
        let single = &rows.printings[1].fields;
        assert_eq!(rows.cards[1].core.oracle_text, None);
        assert_eq!(single.flavor_text, None);
        assert_eq!(single.flavor_name, None);
        assert_eq!(single.normalized_flavor_name, None);
    }

    #[test]
    fn cards_without_images_or_faces_store_an_empty_object() {
        let rows = rows(
            vec![card(json!({"id": "p", "oracle_id": "o", "name": "n"}))],
            &OracleTagIndex::new(),
        );
        assert_eq!(rows.printings[0].fields.image_uris, "{}");
        assert_eq!(rows.cards[0].core.colors, "[]");
        assert_eq!(rows.cards[0].core.legalities, "{}");
    }

    #[test]
    fn records_without_an_oracle_id_only_yield_token_links() {
        let rows = rows(
            vec![card(json!({"id": "p", "name": "n",
                "all_parts": [{"id": "t", "component": "token", "name": "Bird"}]}))],
            &OracleTagIndex::new(),
        );
        assert_eq!(rows.cards.len(), 0);
        assert_eq!(rows.printings.len(), 0);
        assert_eq!(rows.card_tokens.len(), 1);
    }
}
