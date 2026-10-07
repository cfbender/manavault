//! Test helpers for this crate and the crates above it: importing Scryfall
//! card JSON and the card fixtures the tests share. Compiled in every build
//! (not behind a feature) so test and dev builds share one build of this
//! crate.

#![allow(clippy::expect_used)]

use serde_json::Value;

/// Imports Scryfall card JSON into the catalog.
pub async fn import_cards(pool: &sqlx::SqlitePool, cards: &[Value]) {
    let cards: Vec<lotus::scryfall::ScryfallCard> = cards
        .iter()
        .map(|card| serde_json::from_value(card.clone()).expect("valid Scryfall card"))
        .collect();
    crate::catalog::scryfall::import::import_cards(pool, cards)
        .await
        .expect("import");
}

/// Card fixtures shared by the tests.
pub mod fixtures {
    use serde_json::{Value, json};

    /// Shallow-merges `overrides` into `base` (`Map.merge/2`).
    #[must_use]
    pub fn merge(mut base: Value, overrides: Value) -> Value {
        if let (Some(base), Value::Object(overrides)) = (base.as_object_mut(), overrides) {
            for (key, value) in overrides {
                base.insert(key, value);
            }
        }
        base
    }

    /// `black_lotus/0`.
    #[must_use]
    pub fn black_lotus() -> Value {
        json!({
            "id": "scryfall-printing-1",
            "oracle_id": "oracle-1",
            "name": "Black Lotus",
            "type_line": "Artifact",
            "oracle_text": "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
            "mana_cost": "{0}",
            "cmc": 0.0,
            "colors": [],
            "color_identity": [],
            "legalities": {"vintage": "restricted"},
            "games": ["paper"],
            "edhrec_rank": 1,
            "set": "lea",
            "set_name": "Limited Edition Alpha",
            "collector_number": "232",
            "lang": "en",
            "rarity": "rare",
            "finishes": ["nonfoil"],
            "image_uris": {"normal": "https://example.test/black-lotus.jpg"},
            "prices": {"usd": "100000.00"},
            "released_at": "1993-08-05",
            "rulings_uri": "https://api.scryfall.com/cards/oracle-1/rulings"
        })
    }

    /// `black_lotus_beta/0`.
    #[must_use]
    pub fn black_lotus_beta() -> Value {
        merge(
            black_lotus(),
            json!({
                "id": "scryfall-printing-3",
                "set": "leb",
                "set_name": "Limited Edition Beta",
                "collector_number": "233",
                "released_at": "1993-10-04"
            }),
        )
    }

    /// `time_walk/0`.
    #[must_use]
    pub fn time_walk() -> Value {
        json!({
            "id": "scryfall-printing-2",
            "oracle_id": "oracle-2",
            "name": "Time Walk",
            "type_line": "Sorcery",
            "oracle_text": "Take an extra turn after this turn.",
            "mana_cost": "{1}{U}",
            "cmc": 2.0,
            "colors": ["U"],
            "color_identity": ["U"],
            "set": "lea",
            "set_name": "Limited Edition Alpha",
            "collector_number": "84",
            "lang": "ja",
            "rarity": "rare",
            "finishes": ["foil"],
            "prices": {"usd_foil": "5.00"},
            "released_at": "1993-08-05"
        })
    }

    /// `plains/0`.
    #[must_use]
    pub fn plains() -> Value {
        json!({
            "id": "scryfall-printing-basic-plains",
            "oracle_id": "oracle-plains",
            "name": "Plains",
            "type_line": "Basic Land — Plains",
            "cmc": 0.0,
            "colors": [],
            "color_identity": ["W"],
            "set": "lea",
            "set_name": "Limited Edition Alpha",
            "collector_number": "250",
            "lang": "en",
            "rarity": "common",
            "finishes": ["nonfoil"],
            "released_at": "1993-08-05"
        })
    }

    /// `legal_commander_card/0`.
    #[must_use]
    pub fn legal_commander_card() -> Value {
        merge(
            time_walk(),
            json!({
                "id": "scryfall-printing-test-commander",
                "oracle_id": "oracle-test-commander",
                "name": "Test Commander",
                "type_line": "Legendary Creature — Cat",
                "colors": ["W"],
                "color_identity": ["W"],
                "legalities": {"commander": "legal"},
                "set": "tst",
                "set_name": "Test Set",
                "collector_number": "1",
                "lang": "en",
                "finishes": ["nonfoil"],
                "prices": {},
                "released_at": "2026-01-01"
            }),
        )
    }

    /// A card with overrides applied to `black_lotus/0`.
    #[must_use]
    pub fn card(overrides: Value) -> Value {
        merge(black_lotus(), overrides)
    }
}
