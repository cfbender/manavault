//! Which cards can lead a Commander deck and which pairs can share the
//! command zone (`Manavault.Catalog.CommanderRules`), on top of lotus'
//! `can_be_commander` and `commander_pairing`.

use std::sync::LazyLock;

use lotus::commander::{CommanderPairing, can_be_commander as lotus_can_be_commander};
use regex::Regex;

use crate::catalog::card::CardRecord;

// Literal patterns, exercised by the tests below.
static COMMANDER_TYPE: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"\b(?:Creature|Vehicle|Spacecraft)\b").ok());
static PARTNER_LABEL: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"^Partner(?:\s*[—–-]\s*([^(]+?))?\s*(?:\(|$)").ok());

/// The front face of a type line (`"A // B"` → `"A"`).
fn front_face(type_line: &str) -> &str {
    type_line.split("//").next().unwrap_or(type_line)
}

/// Whether the card can be designated as a deck's commander.
///
/// Per Comprehensive Rules 903.3 that is a legendary creature, Vehicle, or
/// Spacecraft (judged by the front face), or a card whose text says it "can
/// be your commander". lotus' `can_be_commander` decides on the front face;
/// legendary Vehicles and Spacecraft are added here because lotus only knows
/// creatures (a lotus gap, see `rust/notes/decks.md`). Judging the front face
/// keeps "Legendary Enchantment — Saga // Legendary Creature" ineligible,
/// which lotus would accept when given the whole type line.
#[must_use]
pub fn can_be_commander(card: &CardRecord) -> bool {
    let type_line = card.type_line.as_deref().unwrap_or("");
    let oracle_text = card.oracle_text.as_deref().unwrap_or("");
    let front = front_face(type_line);
    lotus_can_be_commander(front, oracle_text) || legendary_vehicle(front)
}

fn legendary_vehicle(front: &str) -> bool {
    front.contains("Legendary")
        && COMMANDER_TYPE.as_ref().is_some_and(|re| re.is_match(front))
        && !front.contains("Background")
}

fn pairing(card: &CardRecord) -> Option<CommanderPairing> {
    lotus::commander::commander_pairing(
        card.type_line.as_deref().unwrap_or(""),
        card.oracle_text.as_deref().unwrap_or(""),
    )
}

fn oracle_lines(card: &CardRecord) -> impl Iterator<Item = &str> {
    card.oracle_text
        .as_deref()
        .unwrap_or("")
        .split('\n')
        .map(str::trim)
}

/// A Partner keyword: plain, or restricted to a group ("Partner—Survivors").
#[derive(Debug, PartialEq, Eq)]
enum PartnerLabel {
    Plain,
    Group(String),
}

fn partner_label(card: &CardRecord) -> Option<PartnerLabel> {
    oracle_lines(card).find_map(|line| {
        let captures = PARTNER_LABEL.as_ref()?.captures(line)?;
        Some(match captures.get(1) {
            Some(label) => PartnerLabel::Group(label.as_str().trim().to_lowercase()),
            None => PartnerLabel::Plain,
        })
    })
}

fn base_name(card: &CardRecord) -> &str {
    card.name.split(" // ").next().unwrap_or(&card.name)
}

fn partners_with(card: &CardRecord, other: &CardRecord) -> bool {
    let prefix = format!("partner with {}", base_name(other).to_lowercase());
    oracle_lines(card).any(|line| {
        let line = line.to_lowercase();
        line.strip_prefix(&prefix)
            .is_some_and(|rest| rest.is_empty() || rest.trim_start().starts_with('('))
    })
}

/// Whether two cards form a legal two-commander pairing
/// (`CommanderRules.valid_pair?/2`): matching Partner keywords (restricted
/// variants need the same label), "Partner with" each other, Friends forever,
/// Doctor's companion with a Doctor, or Choose a Background with a Background.
///
/// lotus classifies each card's pairing mechanic; whether two cards match is
/// decided here because lotus has no pair check. lotus counts
/// "Partner—Friends forever" as Friends forever, so it pairs with the older
/// "Friends forever" wording too.
#[must_use]
pub fn valid_pair(a: &CardRecord, b: &CardRecord) -> bool {
    use CommanderPairing as P;
    match (pairing(a), pairing(b)) {
        (Some(P::Partner), Some(P::Partner)) => match (partner_label(a), partner_label(b)) {
            (Some(left), Some(right)) => left == right,
            _ => false,
        },
        (Some(P::PartnerWith), Some(P::PartnerWith)) => partners_with(a, b) && partners_with(b, a),
        (Some(P::FriendsForever), Some(P::FriendsForever))
        | (Some(P::DoctorsCompanion), Some(P::Doctor))
        | (Some(P::Doctor), Some(P::DoctorsCompanion))
        | (Some(P::ChooseABackground), Some(P::Background))
        | (Some(P::Background), Some(P::ChooseABackground)) => true,
        _ => false,
    }
}

/// Whether the commander lets its controller choose a color before the game
/// (`Card.chooses_color_before_game?/1`).
#[must_use]
pub fn chooses_color_before_game(oracle_text: Option<&str>) -> bool {
    oracle_text.is_some_and(|text| {
        text.to_lowercase()
            .contains("choose a color before the game begins")
    })
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;

    pub(crate) fn card(
        name: &str,
        type_line: Option<&str>,
        oracle_text: Option<&str>,
    ) -> CardRecord {
        CardRecord {
            oracle_id: lotus::OracleId::new(format!("oracle-{name}")),
            name: name.to_owned(),
            normalized_name: None,
            layout: None,
            type_line: type_line.map(str::to_owned),
            oracle_text: oracle_text.map(str::to_owned),
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

    fn eligible(type_line: Option<&str>, text: Option<&str>) -> bool {
        can_be_commander(&card("Test Card", type_line, text))
    }

    // commander_rules_test.exs
    #[test]
    fn accepts_legendary_creatures_and_explicit_text() {
        assert!(eligible(Some("Legendary Creature — Cat"), None));
        assert!(eligible(Some("Legendary Artifact Creature — Golem"), None));
        assert!(eligible(
            Some("Legendary Planeswalker — Jace"),
            Some("Jace, Multiverse Architect can be your commander.\n+1: Draw a card.")
        ));
        assert!(eligible(
            Some("Legendary Enchantment"),
            Some("Ashaya's Enduring Bond can be your commander.")
        ));
    }

    #[test]
    fn accepts_legendary_vehicles_and_spacecraft() {
        assert!(eligible(Some("Legendary Artifact — Vehicle"), None));
        assert!(eligible(Some("Legendary Artifact — Spacecraft"), None));
    }

    #[test]
    fn rejects_non_legendary_creatures_and_legendary_non_creatures() {
        assert!(!eligible(Some("Creature — Cat"), None));
        assert!(!eligible(
            Some("Legendary Planeswalker — Jace"),
            Some("+1: Draw.")
        ));
        assert!(!eligible(Some("Legendary Enchantment — Background"), None));
        assert!(!eligible(Some("Legendary Artifact — Equipment"), None));
    }

    #[test]
    fn judges_the_front_face() {
        assert!(eligible(
            Some("Legendary Creature — God // Legendary Enchantment"),
            None
        ));
        assert!(!eligible(
            Some("Legendary Enchantment — Saga // Legendary Creature — Snake"),
            None
        ));
    }

    #[test]
    fn rejects_mentions_and_missing_data() {
        assert!(!eligible(
            Some("Sorcery"),
            Some("Return your commander to your hand. Vehicles can crew.")
        ));
        assert!(!eligible(None, None));
    }

    #[test]
    fn pairs_match_their_mechanics() {
        let creature = Some("Legendary Creature — Human");
        let partner = card(
            "A",
            creature,
            Some("Partner (You can have two commanders.)"),
        );
        let partner_b = card("B", creature, Some("Partner"));
        let survivors = card("C", creature, Some("Partner—Survivors (reminder)"));
        let survivors_b = card("D", creature, Some("Partner—Survivors (reminder)"));
        let vault = card("E", creature, Some("Partner—Vault 13 (reminder)"));
        assert!(valid_pair(&partner, &partner_b));
        assert!(valid_pair(&survivors, &survivors_b));
        assert!(!valid_pair(&survivors, &vault));
        assert!(!valid_pair(&partner, &survivors));

        let ally = card(
            "Named Ally",
            creature,
            Some("Partner with Named Friend (When ...)"),
        );
        let friend = card(
            "Named Friend",
            creature,
            Some("Partner with Named Ally (When ...)"),
        );
        let stranger = card("Named Stranger", creature, None);
        assert!(valid_pair(&ally, &friend));
        assert!(!valid_pair(&ally, &stranger));

        let doctor = card("Doc", Some("Legendary Creature — Time Lord Doctor"), None);
        let companion = card("Comp", creature, Some("Doctor's companion (reminder)"));
        assert!(valid_pair(&companion, &doctor));
        assert!(valid_pair(&doctor, &companion));

        let chooser = card("Ch", creature, Some("Choose a Background (reminder)"));
        let background = card("Bg", Some("Legendary Enchantment — Background"), None);
        assert!(valid_pair(&chooser, &background));
        assert!(!valid_pair(&chooser, &partner));
        assert!(!valid_pair(&stranger, &card("X", creature, None)));
    }
}
