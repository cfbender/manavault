//! `is:` flags the importer derives from a card's Oracle data and stores in
//! `scryfall_cards.search_flags`: the ones that need text heuristics (land
//! cycles, commander roles, French vanilla creatures) or fields only the
//! bulk record carries (meld parts, color indicators).
//!
//! Flags the search can read straight from stored columns (card types,
//! layouts, finishes, frames) are matched in SQL instead, so they work
//! before a catalog sync fills this column.

use std::sync::OnceLock;

use lotus::Legality;
use lotus::scryfall::ScryfallCard;
use regex::Regex;

use crate::catalog::scryfall::bulk::Details;

/// Every flag [`card_flags`] can produce.
pub const FLAGS: [&str; 39] = [
    "indicator",
    "hybrid",
    "phyrexian",
    "frenchvanilla",
    "bear",
    "manland",
    "commander",
    "brawler",
    "duelcommander",
    "oathbreaker",
    "companion",
    "partner",
    "meldpart",
    "meldresult",
    "dual",
    "shockland",
    "fetchland",
    "checkland",
    "fastland",
    "slowland",
    "painland",
    "filterland",
    "gainland",
    "scryland",
    "surveilland",
    "bounceland",
    "canopyland",
    "bikeland",
    "tricycleland",
    "triland",
    "bondland",
    "tangoland",
    "pathway",
    "shadowland",
    "storageland",
    "modal",
    "party",
    "outlaw",
    "historic",
];

/// The stored flag an `is:` value names, through Scryfall's aliases.
#[must_use]
pub fn canonical(value: &str) -> &str {
    match value {
        "creatureland" => "manland",
        "cycleland" | "bicycleland" => "bikeland",
        "crowdland" | "bbdland" | "battlebondland" => "bondland",
        "karoo" => "bounceland",
        "canland" => "canopyland",
        "snarl" => "shadowland",
        "battleland" => "tangoland",
        "trikeland" | "triome" => "tricycleland",
        other => other,
    }
}

/// A regular expression compiled on first use.
struct Pattern {
    source: &'static str,
    regex: OnceLock<Option<Regex>>,
}

impl Pattern {
    const fn new(source: &'static str) -> Self {
        Self {
            source,
            regex: OnceLock::new(),
        }
    }

    fn regex(&self) -> Option<&Regex> {
        self.regex
            .get_or_init(|| Regex::new(self.source).ok())
            .as_ref()
    }

    fn matches(&self, text: &str) -> bool {
        self.regex().is_some_and(|re| re.is_match(text))
    }
}

static ENTERS_TAPPED_ALWAYS: Pattern =
    Pattern::new(r"(?m)^(~|This land) enters( the battlefield)? tapped\.");
static ADDS_TWO_COLORS: Pattern = Pattern::new(r"\{T\}: Add \{[WUBRG]\} or \{[WUBRG]\}");
static ADDS_THREE_COLORS: Pattern =
    Pattern::new(r"\{T\}: Add \{[WUBRG]\}, \{[WUBRG]\}, or \{[WUBRG]\}\.");
static DUAL_TEXT: Pattern = Pattern::new(r"^\(\{T\}: Add \{[WUBRG]\} or \{[WUBRG]\}\.\)$");
static SHOCK: Pattern =
    Pattern::new(r"you may pay 2 life\. If you don't, it enters( the battlefield)? tapped");
static FETCH: Pattern = Pattern::new(
    r"\{T\}, Pay 1 life, Sacrifice [^:]+: Search your library for an? [A-Z][a-z]+ or [A-Z][a-z]+ card",
);
static CHECK: Pattern = Pattern::new(
    r"enters( the battlefield)? tapped unless you control an? [A-Z][a-z]+ or an? [A-Z][a-z]+\.",
);
static FAST: Pattern =
    Pattern::new(r"enters( the battlefield)? tapped unless you control two or fewer other lands");
static SLOW: Pattern =
    Pattern::new(r"enters( the battlefield)? tapped unless you control two or more other lands");
static TANGO: Pattern =
    Pattern::new(r"enters( the battlefield)? tapped unless you control two or more basic lands");
static BOND: Pattern =
    Pattern::new(r"enters( the battlefield)? tapped unless you have two or more opponents");
static PAIN: Pattern = Pattern::new(r"deals 1 damage to you");
static FILTER: Pattern =
    Pattern::new(r"(\{[WUBRG]/[WUBRG]\}|\{1\}), \{T\}: Add \{[WUBRG]\}\{[WUBRG]\}");
static GAIN: Pattern =
    Pattern::new(r"When (~|this land) enters( the battlefield)?, you gain 1 life");
static SCRY: Pattern = Pattern::new(r"When (~|this land) enters( the battlefield)?, scry 1");
static SURVEIL: Pattern = Pattern::new(r"When (~|this land) enters( the battlefield)?, surveil 1");
static BOUNCE: Pattern =
    Pattern::new(r"return (a land|an untapped [A-Z][a-z]+) you control to its owner's hand");
static CANOPY: Pattern = Pattern::new(r"\{T\}, Pay 1 life: Add \{[WUBRG]\} or \{[WUBRG]\}");
static CANOPY_DRAW: Pattern = Pattern::new(r"Sacrifice (~|this land): Draw a card");
static SHADOW: Pattern = Pattern::new(
    r"you may reveal an? [A-Z][a-z]+ or (an? )?[A-Z][a-z]+ card from your hand\. If you don't, (~|this land) enters( the battlefield)? tapped",
);
static STORAGE: Pattern = Pattern::new(r"storage counter");
static MANLAND: Pattern = Pattern::new(r"(?i)(~|this land|\bit) becomes? an? [^.]*creature");
static PARTNER: Pattern =
    Pattern::new(r"(?m)^(Partner|Friends forever|Choose a Background|Doctor's companion)\b");
/// Modes are bulleted; Spree modes start with `+`.
static MODAL: Pattern = Pattern::new(r"•|\bSpree\b");

const BASIC_TYPES: [&str; 5] = ["Plains", "Island", "Swamp", "Mountain", "Forest"];

/// How many basic land types the type line names.
fn basic_types(type_line: &str) -> usize {
    let subtypes = type_line
        .split_once('—')
        .map_or("", |(_, subtypes)| subtypes);
    subtypes
        .split_whitespace()
        .filter(|word| BASIC_TYPES.contains(word))
        .count()
}

fn has_subtype(type_line: &str, subtypes: &[&str]) -> bool {
    type_line.split_once('—').is_some_and(|(_, words)| {
        words
            .split_whitespace()
            .any(|word| subtypes.contains(&word))
    })
}

/// Mana symbols (`W`, `2/W`, `W/U/P`, ...) in the card's and its faces'
/// mana costs.
fn mana_symbols(card: &ScryfallCard) -> Vec<String> {
    let costs = std::iter::once(card.mana_cost.as_deref())
        .chain(card.card_faces.iter().map(|face| face.mana_cost.as_deref()))
        .flatten();
    let mut symbols = Vec::new();
    for cost in costs {
        for part in cost.split('{').skip(1) {
            if let Some((symbol, _)) = part.split_once('}') {
                symbols.push(symbol.to_uppercase());
            }
        }
    }
    symbols
}

/// Whether every comma-separated phrase of every rules line starts with one
/// of the card's keywords (reminder text aside).
fn only_keywords(text: &str, keywords: &[String]) -> bool {
    if keywords.is_empty() || text.trim().is_empty() {
        return false;
    }
    let keywords: Vec<String> = keywords.iter().map(|k| k.to_lowercase()).collect();
    text.lines().filter(|line| *line != "---").all(|line| {
        let lower = line.to_lowercase();
        // A keyword with a cost after an em dash (`Escape—{3}{R}{G}, ...`).
        if keywords.iter().any(|k| lower.starts_with(&format!("{k}—"))) {
            return true;
        }
        let mut stripped = String::new();
        let mut depth = 0_usize;
        for c in line.chars() {
            match c {
                '(' => depth += 1,
                ')' => depth = depth.saturating_sub(1),
                c if depth == 0 => stripped.push(c),
                _ => {}
            }
        }
        stripped
            .split([',', ';'])
            .map(|phrase| phrase.trim().to_lowercase())
            .filter(|phrase| !phrase.is_empty())
            .all(|phrase| keywords.iter().any(|k| phrase.starts_with(k.as_str())))
    })
}

/// The `is:` flags of a card, in [`FLAGS`] order.
#[must_use]
pub fn card_flags(card: &ScryfallCard, details: &Details) -> Vec<&'static str> {
    let type_line = card.type_line.as_deref().unwrap_or_default();
    let front_type = type_line.split(" // ").next().unwrap_or_default();
    let mut text = card.full_oracle_text().unwrap_or_default();
    for name in std::iter::once(card.name.as_str())
        .chain(card.card_faces.iter().map(|face| face.name.as_str()))
        .filter(|name| !name.is_empty())
    {
        text = text.replace(name, "~");
    }
    let land = front_type.contains("Land");
    let creature = type_line.contains("Creature");
    let legendary_creature = front_type.contains("Legendary") && front_type.contains("Creature");
    let basics = basic_types(front_type);
    let symbols = mana_symbols(card);
    let changeling = details.keywords.iter().any(|k| k == "Changeling");
    let background = front_type.contains("Background");
    let legendary_vehicle = front_type.contains("Legendary")
        && (front_type.contains("Vehicle") || front_type.contains("Spacecraft"))
        && details.power().is_some();
    let meld_component = card
        .all_parts
        .iter()
        .find(|part| part.name == card.name)
        .map(|part| part.component.as_str());
    let commander = (legendary_creature
        || legendary_vehicle
        || background
        || text.contains("can be your commander"))
        && meld_component != Some("meld_result")
        && card.legalities.get("commander") != Some(&Legality::Banned);

    let checks: [bool; 39] = [
        details.has_color_indicator(),
        symbols
            .iter()
            .any(|symbol| symbol.replace("/P", "").contains('/')),
        symbols.iter().any(|symbol| symbol.contains('P')) || text.contains("/P}"),
        creature && only_keywords(&text, &details.keywords),
        front_type.contains("Creature")
            && card.cmc == Some(2.0)
            && details.power() == Some("2")
            && details.toughness() == Some("2"),
        land && MANLAND.matches(&text),
        commander,
        commander || (front_type.contains("Legendary") && front_type.contains("Planeswalker")),
        commander && card.legalities.get("duel") != Some(&Legality::Banned),
        front_type.contains("Planeswalker"),
        text.contains("Companion —"),
        commander && (background || PARTNER.matches(&text)),
        meld_component == Some("meld_part"),
        meld_component == Some("meld_result"),
        land && basics == 2 && !front_type.contains("Snow") && DUAL_TEXT.matches(&text),
        land && basics == 2 && SHOCK.matches(&text),
        land && FETCH.matches(&text),
        land && CHECK.matches(&text) && ADDS_TWO_COLORS.matches(&text),
        land && FAST.matches(&text) && ADDS_TWO_COLORS.matches(&text),
        land && SLOW.matches(&text),
        land && !ENTERS_TAPPED_ALWAYS.matches(&text)
            && PAIN.matches(&text)
            && text.contains("{T}: Add {C}.")
            && ADDS_TWO_COLORS.matches(&text),
        land && FILTER.matches(&text),
        land && GAIN.matches(&text) && ADDS_TWO_COLORS.matches(&text),
        land && SCRY.matches(&text) && ADDS_TWO_COLORS.matches(&text),
        land && SURVEIL.matches(&text) && ADDS_TWO_COLORS.matches(&text),
        land && BOUNCE.matches(&text),
        land && CANOPY.matches(&text) && CANOPY_DRAW.matches(&text),
        land && basics == 2 && text.contains("Cycling {2}") && ENTERS_TAPPED_ALWAYS.matches(&text),
        land && basics == 3 && text.contains("Cycling {3}"),
        land && basics == 0
            && ENTERS_TAPPED_ALWAYS.matches(&text)
            && ADDS_THREE_COLORS.matches(&text),
        land && BOND.matches(&text),
        land && basics == 2 && TANGO.matches(&text),
        land && card.layout.as_deref() == Some("modal_dfc") && card.name.contains("Pathway"),
        land && SHADOW.matches(&text),
        land && STORAGE.matches(&text),
        MODAL.matches(&text),
        creature
            && (changeling || has_subtype(type_line, &["Cleric", "Rogue", "Warrior", "Wizard"])),
        creature
            && (changeling
                || has_subtype(
                    type_line,
                    &["Assassin", "Mercenary", "Pirate", "Rogue", "Warlock"],
                )),
        type_line.contains("Legendary")
            || type_line.contains("Artifact")
            || type_line.contains("Saga"),
    ];
    FLAGS
        .iter()
        .zip(checks)
        .filter_map(|(flag, matched)| matched.then_some(*flag))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::scryfall::bulk::decode_card;
    use serde_json::{Value, json};

    fn flags(record: Value) -> Vec<&'static str> {
        let mut record = record;
        if let Some(object) = record.as_object_mut() {
            object.entry("id").or_insert(json!("p"));
            object.entry("oracle_id").or_insert(json!("o"));
        }
        let card = decode_card(&record).unwrap();
        card_flags(&card.card, &card.details)
    }

    fn land(name: &str, type_line: &str, text: &str) -> Vec<&'static str> {
        flags(json!({"name": name, "type_line": type_line, "oracle_text": text}))
    }

    #[test]
    fn patterns_compile() {
        for pattern in [
            &ENTERS_TAPPED_ALWAYS,
            &ADDS_TWO_COLORS,
            &ADDS_THREE_COLORS,
            &DUAL_TEXT,
            &SHOCK,
            &FETCH,
            &CHECK,
            &FAST,
            &SLOW,
            &TANGO,
            &BOND,
            &PAIN,
            &FILTER,
            &GAIN,
            &SCRY,
            &SURVEIL,
            &BOUNCE,
            &CANOPY,
            &CANOPY_DRAW,
            &SHADOW,
            &STORAGE,
            &MANLAND,
            &PARTNER,
            &MODAL,
        ] {
            assert!(pattern.regex().is_some(), "{}", pattern.source);
        }
    }

    #[test]
    fn recognizes_land_cycles() {
        let cases = [
            (
                land("Tundra", "Land — Plains Island", "({T}: Add {W} or {U}.)"),
                "dual",
            ),
            (
                land(
                    "Hallowed Fountain",
                    "Land — Plains Island",
                    "({T}: Add {W} or {U}.)\nAs Hallowed Fountain enters, you may pay 2 life. If you don't, it enters tapped.",
                ),
                "shockland",
            ),
            (
                land(
                    "Flooded Strand",
                    "Land",
                    "{T}, Pay 1 life, Sacrifice Flooded Strand: Search your library for a Plains or Island card, put it onto the battlefield, then shuffle.",
                ),
                "fetchland",
            ),
            (
                land(
                    "Glacial Fortress",
                    "Land",
                    "Glacial Fortress enters tapped unless you control a Plains or an Island.\n{T}: Add {W} or {U}.",
                ),
                "checkland",
            ),
            (
                land(
                    "Seachrome Coast",
                    "Land",
                    "Seachrome Coast enters tapped unless you control two or fewer other lands.\n{T}: Add {W} or {U}.",
                ),
                "fastland",
            ),
            (
                land(
                    "Adarkar Wastes",
                    "Land",
                    "{T}: Add {C}.\n{T}: Add {W} or {U}. Adarkar Wastes deals 1 damage to you.",
                ),
                "painland",
            ),
            (
                land(
                    "Azorius Chancery",
                    "Land",
                    "Azorius Chancery enters tapped.\nWhen Azorius Chancery enters, return a land you control to its owner's hand.\n{T}: Add {W}{U}.",
                ),
                "bounceland",
            ),
            (
                land(
                    "Raugrin Triome",
                    "Land — Island Mountain Plains",
                    "({T}: Add {U}, {R}, or {W}.)\nRaugrin Triome enters tapped.\nCycling {3} ({3}, Discard this card: Draw a card.)",
                ),
                "tricycleland",
            ),
            (
                land(
                    "Arcane Sanctum",
                    "Land",
                    "Arcane Sanctum enters tapped.\n{T}: Add {W}, {U}, or {B}.",
                ),
                "triland",
            ),
            (
                land(
                    "Mutavault",
                    "Land",
                    "{T}: Add {C}.\n{1}: Mutavault becomes a 2/2 creature with all creature types until end of turn. It's still a land.",
                ),
                "manland",
            ),
        ];
        for (flags, expected) in cases {
            assert!(flags.contains(&expected), "{expected}: {flags:?}");
        }
        // A shockland is not a dual, and a plain basic is nothing.
        let shock = land(
            "Hallowed Fountain",
            "Land — Plains Island",
            "({T}: Add {W} or {U}.)\nAs Hallowed Fountain enters, you may pay 2 life. If you don't, it enters tapped.",
        );
        assert!(!shock.contains(&"dual"));
        assert_eq!(
            land("Plains", "Basic Land — Plains", "({T}: Add {W}.)"),
            Vec::<&str>::new()
        );
    }

    #[test]
    fn recognizes_creature_and_commander_roles() {
        let bear = flags(json!({
            "name": "Grizzly Bears", "type_line": "Creature — Bear", "cmc": 2.0,
            "power": "2", "toughness": "2", "oracle_text": ""
        }));
        assert_eq!(bear, ["bear"]);
        let french = flags(json!({
            "name": "Serra Angel", "type_line": "Creature — Angel", "cmc": 5.0,
            "power": "4", "toughness": "4", "keywords": ["Flying", "Vigilance"],
            "oracle_text": "Flying, vigilance"
        }));
        assert_eq!(french, ["frenchvanilla"]);
        let not_french = flags(json!({
            "name": "Prodigal Sorcerer", "type_line": "Creature — Human Wizard",
            "oracle_text": "{T}: Prodigal Sorcerer deals 1 damage to any target."
        }));
        assert_eq!(not_french, ["party"]);
        let commander = flags(json!({
            "name": "Thrasios, Triton Hero", "type_line": "Legendary Creature — Merfolk Wizard",
            "oracle_text": "{4}: Scry 1, then reveal the top card of your library.\nPartner (You can have two commanders if both have partner.)",
            "mana_cost": "{G}{U}", "legalities": {"duel": "banned"}
        }));
        assert_eq!(
            commander,
            ["commander", "brawler", "partner", "party", "historic"]
        );
        let hybrid = flags(json!({
            "name": "Kitchen Finks", "type_line": "Creature — Ouphe", "mana_cost": "{1}{G/W}{G/W}",
            "oracle_text": "Persist"
        }));
        assert!(hybrid.contains(&"hybrid") && !hybrid.contains(&"phyrexian"));
        let phyrexian = flags(json!({
            "name": "Dismember", "type_line": "Instant", "mana_cost": "{1}{B/P}{B/P}",
            "oracle_text": "Target creature gets -5/-5 until end of turn."
        }));
        assert_eq!(phyrexian, ["phyrexian"]);
    }
}
