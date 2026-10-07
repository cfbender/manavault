//! The deck data sent to the AI provider (`AI.DeckAnalysis.Payload`).

use std::collections::BTreeSet;
use std::sync::LazyLock;

use regex::Regex;
use serde_json::{Map, Value, json};

use crate::ai::decks::DeckCardInput;
use manavault_catalog::catalog::card::CardRecord;

static LAND: LazyLock<Option<Regex>> = LazyLock::new(|| Regex::new(r"(?i)\bLand\b").ok());
static CHOOSES_COLOR: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"(?iu)choose a color before the game begins").ok());

/// The deck fields the payload names.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PayloadDeck<'a> {
    pub name: &'a str,
    pub format: &'a str,
    pub primer: Option<&'a str>,
}

/// The provider payload plus the facts recommendation checks need.
#[derive(Debug, Clone, PartialEq)]
pub struct Payload {
    /// `%{deck: ..., facts: ...}` as JSON.
    pub value: Value,
    pub format: String,
    pub game_changer_count: i64,
    /// `deck.commander_color_identity`; `None` without a commander.
    pub commander_color_identity: Option<Vec<String>>,
    /// Names of the counted cards (`deck.cards[].name`).
    pub card_names: Vec<String>,
}

fn decode_list(text: &str) -> Vec<Value> {
    match serde_json::from_str(text) {
        Ok(Value::Array(values)) => values,
        _ => Vec::new(),
    }
}

fn decode_map(text: &str) -> Map<String, Value> {
    match serde_json::from_str(text) {
        Ok(Value::Object(map)) => map,
        _ => Map::new(),
    }
}

fn is_land(card: &CardRecord) -> bool {
    match (card.type_line.as_deref(), LAND.as_ref()) {
        (Some(type_line), Some(land)) => land.is_match(type_line),
        _ => false,
    }
}

/// `Card.chooses_color_before_game?/1`.
fn chooses_color_before_game(card: &CardRecord) -> bool {
    match (card.oracle_text.as_deref(), CHOOSES_COLOR.as_ref()) {
        (Some(text), Some(pattern)) => pattern.is_match(text),
        _ => false,
    }
}

fn row_colors<'a>(cards: impl Iterator<Item = &'a DeckCardInput>) -> BTreeSet<String> {
    cards
        .flat_map(|deck_card| decode_list(&deck_card.card.color_identity))
        .filter_map(|color| color.as_str().map(str::to_uppercase))
        .collect()
}

fn color_sort_value(color: &str) -> usize {
    ["W", "U", "B", "R", "G", "M", "C"]
        .iter()
        .position(|candidate| *candidate == color)
        .unwrap_or(99)
}

/// `DeckSummaries.commander_color_identity_from_cards/1`: the commanders'
/// color identity in WUBRG order, `["C"]` when colorless, `None` without a
/// commander. Commanders that choose a color before the game add the
/// counted cards' extra colors when they fit in the chosen slots.
#[must_use]
pub fn commander_color_identity(cards: &[DeckCardInput]) -> Option<Vec<String>> {
    let (commanders, others): (Vec<&DeckCardInput>, Vec<&DeckCardInput>) = cards
        .iter()
        .partition(|card| card.zone == lotus::Zone::Commander);
    if commanders.is_empty() {
        return None;
    }
    let printed = row_colors(commanders.iter().copied());
    let slots = commanders
        .iter()
        .filter(|card| chooses_color_before_game(&card.card))
        .count();
    let extra: BTreeSet<String> = row_colors(
        others
            .iter()
            .copied()
            .filter(|card| card.counts_toward_deck_total()),
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
    colors.sort_by(|a, b| {
        color_sort_value(a)
            .cmp(&color_sort_value(b))
            .then_with(|| a.cmp(b))
    });
    Some(colors)
}

fn put_unless_default(map: &mut Map<String, Value>, key: &str, value: Value, default: &Value) {
    if &value != default {
        map.insert(key.to_owned(), value);
    }
}

fn number(value: Option<f64>) -> Value {
    value
        .and_then(serde_json::Number::from_f64)
        .map_or(Value::Null, Value::Number)
}

fn card_payload(deck_card: &DeckCardInput, format: &str) -> Value {
    let card = &deck_card.card;
    let legalities = decode_map(&card.legalities);
    let mut map = Map::new();
    map.insert("name".into(), json!(card.name));
    map.insert("type_line".into(), json!(card.type_line));
    map.insert("oracle_text".into(), json!(card.oracle_text));
    put_unless_default(&mut map, "quantity", json!(deck_card.quantity), &json!(1));
    put_unless_default(
        &mut map,
        "zone",
        json!(deck_card.zone.as_str()),
        &json!("mainboard"),
    );
    put_unless_default(&mut map, "mana_value", number(card.cmc), &Value::Null);
    put_unless_default(&mut map, "mana_cost", json!(card.mana_cost), &Value::Null);
    put_unless_default(
        &mut map,
        "color_identity",
        Value::Array(decode_list(&card.color_identity)),
        &json!([]),
    );
    put_unless_default(
        &mut map,
        "format_legality",
        legalities
            .get(format)
            .cloned()
            .unwrap_or_else(|| json!("not_legal")),
        &json!("legal"),
    );
    put_unless_default(
        &mut map,
        "game_changer",
        json!(card.game_changer),
        &json!(false),
    );
    put_unless_default(
        &mut map,
        "deck_category",
        json!(card.deck_category),
        &Value::Null,
    );
    put_unless_default(
        &mut map,
        "deck_themes",
        Value::Array(decode_list(&card.deck_themes)),
        &json!([]),
    );
    Value::Object(map)
}

fn counted_quantity<'a>(cards: impl Iterator<Item = &'a &'a DeckCardInput>) -> i64 {
    cards.map(|card| card.quantity).sum()
}

/// `Payload.build/2`: the counted cards (mainboard and commander) with
/// authoritative counts calculated here, so the model need not recount.
#[must_use]
pub fn build(deck: &PayloadDeck<'_>, deck_cards: &[DeckCardInput]) -> Payload {
    let counted: Vec<&DeckCardInput> = deck_cards
        .iter()
        .filter(|card| card.counts_toward_deck_total())
        .collect();
    let counted_owned: Vec<DeckCardInput> = counted.iter().map(|card| (*card).clone()).collect();
    let card_count = counted_quantity(counted.iter());
    let land_count = counted_quantity(counted.iter().filter(|card| is_land(&card.card)));
    let game_changer_count = counted.iter().filter(|card| card.card.game_changer).count();
    let game_changer_count = i64::try_from(game_changer_count).unwrap_or(i64::MAX);
    let commander_color_identity = commander_color_identity(&counted_owned);

    let mut salty: Vec<&DeckCardInput> = counted
        .iter()
        .copied()
        .filter(|card| card.card.edhrec_saltiness.is_some_and(|score| score > 0.0))
        .collect();
    salty.sort_by(|a, b| {
        b.card
            .edhrec_saltiness
            .partial_cmp(&a.card.edhrec_saltiness)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let saltiest: Vec<Value> = salty
        .iter()
        .take(5)
        .map(|card| json!({"name": card.card.name, "score": number(card.card.edhrec_saltiness)}))
        .collect();

    let value = json!({
        "deck": {
            "name": deck.name,
            "format": deck.format,
            "primer": deck.primer,
            "commander_color_identity": commander_color_identity,
            "cards": counted.iter().map(|card| card_payload(card, deck.format)).collect::<Vec<_>>(),
        },
        "facts": {
            "card_count": card_count,
            "land_count": land_count,
            "nonland_count": card_count - land_count,
            "game_changer_count": game_changer_count,
            "commanders": counted
                .iter()
                .filter(|card| card.zone == lotus::Zone::Commander)
                .map(|card| card.card.name.clone())
                .collect::<Vec<_>>(),
            "saltiest_cards": saltiest,
        }
    });
    Payload {
        value,
        format: deck.format.to_owned(),
        game_changer_count,
        commander_color_identity,
        card_names: counted.iter().map(|card| card.card.name.clone()).collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lotus::{OracleId, Zone};

    fn card(name: &str, type_line: &str) -> CardRecord {
        CardRecord {
            oracle_id: OracleId::new(format!("oracle-{name}")),
            name: name.into(),
            normalized_name: None,
            layout: None,
            type_line: Some(type_line.into()),
            oracle_text: None,
            mana_cost: None,
            cmc: None,
            colors: "[]".into(),
            color_identity: "[]".into(),
            legalities: "{}".into(),
            game_changer: false,
            edhrec_rank: None,
            edhrec_commander_rank: None,
            edhrec_saltiness: None,
            oracle_tags: "[]".into(),
            deck_category: None,
            deck_themes: "[]".into(),
            rulings_uri: None,
        }
    }

    fn entry(card: CardRecord, quantity: i64, zone: Zone) -> DeckCardInput {
        DeckCardInput {
            card,
            quantity,
            zone,
        }
    }

    const DECK: PayloadDeck<'static> = PayloadDeck {
        name: "Land Count",
        format: "commander",
        primer: None,
    };

    #[test]
    fn payload_includes_authoritative_land_metadata_from_counted_zones() {
        let cards = vec![
            entry(card("Plains", "Basic Land — Plains"), 38, Zone::Mainboard),
            entry(
                card("Bala Ged Recovery // Bala Ged Sanctuary", "Sorcery // Land"),
                1,
                Zone::Mainboard,
            ),
            entry(
                card("Test Commander", "Legendary Creature — Cat"),
                1,
                Zone::Commander,
            ),
            entry(card("Island", "Basic Land — Island"), 4, Zone::Considering),
        ];
        let payload = build(&DECK, &cards);
        assert_eq!(payload.value["facts"]["card_count"], 40);
        assert_eq!(payload.value["facts"]["land_count"], 39);
        assert_eq!(payload.value["facts"]["nonland_count"], 1);
        assert_eq!(payload.value["deck"]["cards"].as_array().unwrap().len(), 3);
        assert_eq!(
            payload.value["facts"]["commanders"],
            json!(["Test Commander"])
        );
        assert_eq!(payload.commander_color_identity, Some(vec!["C".to_owned()]));
    }

    #[test]
    fn payload_omits_repeated_card_defaults_without_losing_exceptional_values() {
        let ordinary = CardRecord {
            oracle_text: Some("Draw a card.".into()),
            cmc: Some(1.0),
            mana_cost: Some("{U}".into()),
            legalities: r#"{"commander":"legal"}"#.into(),
            edhrec_saltiness: Some(0.5),
            ..card("Ordinary Spell", "Instant")
        };
        let exceptional = CardRecord {
            oracle_text: Some("Flying".into()),
            color_identity: r#"["U"]"#.into(),
            legalities: r#"{"commander":"restricted"}"#.into(),
            game_changer: true,
            deck_category: Some("card_advantage".into()),
            deck_themes: r#"["draw"]"#.into(),
            edhrec_saltiness: Some(3.25),
            ..card("Exceptional Card", "Legendary Creature")
        };
        let cards = vec![
            entry(ordinary, 1, Zone::Mainboard),
            entry(exceptional, 2, Zone::Commander),
        ];
        let payload = build(
            &PayloadDeck {
                name: "Compact",
                ..DECK
            },
            &cards,
        );
        let ordinary = payload.value["deck"]["cards"][0].as_object().unwrap();
        for key in [
            "quantity",
            "zone",
            "color_identity",
            "format_legality",
            "game_changer",
            "deck_themes",
        ] {
            assert!(!ordinary.contains_key(key), "{key}");
        }
        assert_eq!(ordinary["mana_value"], json!(1.0));
        assert_eq!(ordinary["mana_cost"], "{U}");
        let exceptional = &payload.value["deck"]["cards"][1];
        assert_eq!(exceptional["quantity"], 2);
        assert_eq!(exceptional["zone"], "commander");
        assert_eq!(exceptional["color_identity"], json!(["U"]));
        assert_eq!(exceptional["format_legality"], "restricted");
        assert_eq!(exceptional["game_changer"], true);
        assert_eq!(exceptional["deck_category"], "card_advantage");
        assert_eq!(exceptional["deck_themes"], json!(["draw"]));
        assert_eq!(
            payload.value["facts"]["saltiest_cards"],
            json!([
                {"name": "Exceptional Card", "score": 3.25},
                {"name": "Ordinary Spell", "score": 0.5}
            ])
        );
        assert_eq!(payload.game_changer_count, 1);
        assert_eq!(payload.commander_color_identity, Some(vec!["U".to_owned()]));
    }

    #[test]
    fn missing_format_legality_reads_as_not_legal_and_chosen_colors_join_identity() {
        let commander = CardRecord {
            oracle_text: Some("Choose a color before the game begins.".into()),
            color_identity: r#"["G"]"#.into(),
            ..card("Chooser", "Legendary Creature")
        };
        let red = CardRecord {
            color_identity: r#"["R"]"#.into(),
            ..card("Red Spell", "Instant")
        };
        let blue = CardRecord {
            color_identity: r#"["u"]"#.into(),
            ..card("Blue Maybe", "Instant")
        };
        let cards = vec![
            entry(commander, 1, Zone::Commander),
            entry(red, 1, Zone::Mainboard),
            entry(blue, 1, Zone::Considering),
        ];
        let payload = build(&DECK, &cards);
        assert_eq!(
            payload.value["deck"]["cards"][1]["format_legality"],
            "not_legal"
        );
        assert_eq!(
            payload.commander_color_identity,
            Some(vec!["R".to_owned(), "G".to_owned()])
        );
        assert_eq!(
            payload.value["deck"]["commander_color_identity"],
            json!(["R", "G"])
        );
    }
}
