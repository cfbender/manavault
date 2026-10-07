//! Which cards can lead a Commander deck and which pairs can share the
//! command zone (`Manavault.Catalog.CommanderRules`). The rules live in lotus
//! (`can_be_commander` per CR 903.3 and `valid_pair`); this module adapts the
//! catalog's card rows to them.
//!
//! lotus requires the Doctor of a Doctor's companion pair to be a legendary
//! creature; `CommanderRules.valid_pair?/2` accepted any "Time Lord Doctor"
//! type line, but a non-legendary one cannot be a commander.

use lotus::commander::CommanderCard;

use manavault_catalog::catalog::card::CardRecord;

fn commander_card(card: &CardRecord) -> CommanderCard<'_> {
    CommanderCard {
        name: &card.name,
        type_line: card.type_line.as_deref().unwrap_or(""),
        oracle_text: card.oracle_text.as_deref().unwrap_or(""),
    }
}

/// Whether the card can be designated as a deck's commander: a legendary
/// creature, Vehicle, or Spacecraft judged by the front face, or a card whose
/// text says it "can be your commander" (CR 903.3).
#[must_use]
pub fn can_be_commander(card: &CardRecord) -> bool {
    let card = commander_card(card);
    lotus::can_be_commander(card.type_line, card.oracle_text)
}

/// Whether two cards form a legal two-commander pairing
/// (`CommanderRules.valid_pair?/2`): matching Partner keywords (restricted
/// variants need the same label), "Partner with" each other, Friends forever,
/// Doctor's companion with a legendary Time Lord Doctor, or Choose a
/// Background with a Background.
#[must_use]
pub fn valid_pair(a: &CardRecord, b: &CardRecord) -> bool {
    lotus::commander::valid_pair(&commander_card(a), &commander_card(b))
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

    // Commander eligibility rules.
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
