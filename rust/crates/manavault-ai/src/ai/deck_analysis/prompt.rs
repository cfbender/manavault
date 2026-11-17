//! Deck analysis prompts and the structured response schema
//! (`AI.DeckAnalysis.Prompt`).

use serde_json::{Value, json};

use crate::ai::prompt_text::{ANALYSIS_SYSTEM, ANALYSIS_USER_HEAD};

/// Trimmed custom instructions, when any are set.
pub(crate) fn custom_instructions(instructions: Option<&str>) -> Option<&str> {
    instructions
        .map(str::trim)
        .filter(|instructions| !instructions.is_empty())
}

/// `Prompt.system/1`: the analyst instructions, plus the user's custom
/// instructions when set.
#[must_use]
pub fn system(custom: Option<&str>) -> String {
    match custom_instructions(custom) {
        None => ANALYSIS_SYSTEM.to_owned(),
        Some(instructions) => format!(
            "{ANALYSIS_SYSTEM}\nFollow these user-defined deck analysis instructions wherever they do not conflict with\nthe requirements above:\n\n<custom_analysis_instructions>\n{instructions}\n</custom_analysis_instructions>\n"
        ),
    }
}

/// `Prompt.user/1`: the request with the payload JSON.
#[must_use]
pub fn user(payload: &Value) -> String {
    format!("{ANALYSIS_USER_HEAD}{payload}\n")
}

/// `Prompt.schema/1`: the strict JSON schema. Without custom instructions
/// `custom_sections` must be empty.
#[must_use]
pub fn schema(custom: Option<&str>) -> Value {
    let string = json!({"type": "string"});
    let strings = json!({"type": "array", "items": string});
    let nullable_bracket = json!({"type": ["integer", "null"], "minimum": 1, "maximum": 5});
    let mut custom_sections = json!({
        "type": "array",
        "items": {
            "type": "object",
            "additionalProperties": false,
            "properties": {"title": string, "content": string},
            "required": ["title", "content"]
        }
    });
    if let (None, Some(map)) = (custom_instructions(custom), custom_sections.as_object_mut()) {
        map.insert("maxItems".into(), json!(0));
    }
    let ratings: Vec<String> = (1..=5)
        .flat_map(|bracket| ["-", "", "+"].map(|suffix| format!("{bracket}{suffix}")))
        .collect();
    json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "summary": string,
            "themes": strings,
            "game_plan": string,
            "opponent_experience": string,
            "closing_out": string,
            "from_behind": string,
            "official_bracket": nullable_bracket,
            "play_bracket": nullable_bracket,
            "bracket_rating": {
                "anyOf": [
                    {"type": "string", "enum": ratings},
                    {"type": "null"}
                ]
            },
            "bracket_rationale": string,
            "power_up": strings,
            "power_down": strings,
            "consistency": strings,
            "mulligan_guide": strings,
            "custom_sections": custom_sections,
            "card_categories": {
                "type": "array",
                "maxItems": super::result::MAX_CARD_CATEGORIES,
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {"name": string, "description": string},
                    "required": ["name", "description"]
                }
            }
        },
        "required": [
            "summary", "themes", "game_plan", "opponent_experience", "closing_out", "from_behind",
            "official_bracket", "play_bracket", "bracket_rating", "bracket_rationale", "power_up",
            "power_down", "consistency", "mulligan_guide", "custom_sections", "card_categories"
        ]
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn squashed(text: &str) -> String {
        text.split_whitespace().collect::<Vec<_>>().join(" ")
    }

    #[test]
    fn requests_linked_card_references() {
        let prompt = system(None);
        assert!(prompt.contains("wrap every exact Magic card name in double"));
        assert!(prompt.contains("square brackets, for example [[Sun Titan]]"));
        assert!(prompt.contains("Use deeper reasoning"));
        assert_eq!(system(Some("   ")), prompt);
    }

    #[test]
    fn includes_custom_instructions_in_the_system_prompt() {
        let prompt = system(Some(
            "  Never suggest infinite combos. Add another section for budget upgrades. ",
        ));
        assert!(prompt.ends_with(
            "Do not add a role for the commander or an\nOther role.\n\nFollow these user-defined deck analysis instructions wherever they do not conflict with\nthe requirements above:\n\n<custom_analysis_instructions>\nNever suggest infinite combos. Add another section for budget upgrades.\n</custom_analysis_instructions>\n"
        ));
        for expected in [
            "authoritative metadata calculated by ManaVault",
            "mulligan_guide",
            "opponent_experience",
            "long and solitaire-like",
            "repeated discard, stax, locks",
            "Do not duplicate this or another standard field",
        ] {
            assert!(prompt.contains(expected), "{expected}");
        }
    }

    #[test]
    fn grounds_commander_analysis_in_structure_brackets_and_interaction() {
        let prompt = squashed(&system(None));
        for expected in [
            "three opponents starting at 40 life each, 120 life in total",
            "is a partial finisher, not a win condition",
            "Take inventory of the resources the deck's engine actually produces",
            "Base every claim about what a deck card does on its supplied oracle_text",
            "The Command Zone's 2025 template",
            "Frank Karsten's mana-curve simulations for casual Commander",
            "Start from about 42 lands plus [[Sol Ring]]",
            "A midrange deck below 37 lands",
            "Run fewer cards at the commander's own mana value",
            "a four- to six-mana commander wants about seven to nine mana rocks",
            "the first mulligan in a multiplayer game is free",
            "Never cut a card from a role you call thin",
            "Consistency changes must not weaken a thin stage",
            "flexible matchmaking guidelines",
            "violating an expectation once does not immediately move a deck",
            "One [[Nexus of Fate]] is not a chained or looped extra-turn plan",
            "does not, by itself, make an otherwise moderate deck Bracket 4",
            "density, redundancy, synergy, tutorability",
            "Do not recite each bracket's restrictions",
            "Do not calculate the suffix from the difference",
            "plus means the upper end without quite reaching the next bracket",
            "keeping the official comparison in the analysis body",
            "not official WotC sub-brackets",
            "Judge interaction by its net value in a multiplayer game",
            "Ordinary costs or symmetrical effects are not inherently anti-synergy",
            "Break its objective into three stages",
            "engine pieces that perform the core action, multipliers",
            "fewer cards in whatever role the commander fills",
            "Prefer synergy over generic staples",
            "Size interaction to the plan",
            "remove the lowest-synergy cards from over-represented roles first",
            "In power_up, lead with the change that most strengthens the thinnest stage",
            "pair each addition with the low-synergy card it should replace",
            "In consistency, judge whether the deck reliably assembles its plan on time",
            "Every consistency item must recommend a concrete card addition, cut, replacement, or quantity change",
            "Do not include gameplay advice, sequencing tips, mulligan decisions, or other ways to pilot the deck in consistency",
        ] {
            assert!(prompt.contains(expected), "{expected}");
        }

        let user_prompt = squashed(&user(
            &json!({"deck": {"format": "commander", "cards": []}, "facts": {}}),
        ));
        assert!(user_prompt.contains("multiplayer deck that must defeat"));
        assert!(user_prompt.contains("Identify its objective, the resources"));
        assert!(user_prompt.contains("naming both the cards to add and the cards to cut"));
        assert!(user(&json!({"facts": {}})).ends_with("Deck data:\n{\"facts\":{}}\n"));
    }

    #[test]
    fn schema_requires_a_single_typed_rating_and_limits_custom_sections() {
        let schema = schema(None);
        assert!(
            schema["required"]
                .as_array()
                .unwrap()
                .contains(&json!("bracket_rating"))
        );
        assert_eq!(
            schema["properties"]["bracket_rating"],
            json!({"anyOf": [
                {"type": "string", "enum": ["1-", "1", "1+", "2-", "2", "2+", "3-", "3", "3+", "4-", "4", "4+", "5-", "5", "5+"]},
                {"type": "null"}
            ]})
        );
        assert_eq!(schema["properties"]["custom_sections"]["maxItems"], 0);
        let custom = super::schema(Some("Add a budget section."));
        assert!(
            custom["properties"]["custom_sections"]
                .get("maxItems")
                .is_none()
        );
    }
}
