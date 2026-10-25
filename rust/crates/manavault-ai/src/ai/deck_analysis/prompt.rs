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
        assert!(prompt.ends_with(
            "https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-october-21-2025.\nIn game_plan, walk through the objective chain and how its pieces sequence over a typical game,\nincluding roughly when the deck expects to present a win or a dominant position.\nIn closing_out, explain how the deck turns a winning position into an actual win: which\nfinishers or lines it uses, the resources it will have when it deploys them, roughly how many\nturns that takes, and what interaction or protection keeps it on track. For Commander, show how\nit closes out all three opponents and how it handles being targeted by the table on the way\nthere. Say plainly when the deck struggles to finish.\nIn from_behind, explain how the deck plays when it falls behind: after a board wipe, a slow or\ndisrupted start, losing its commander or a key engine piece, or facing a faster opponent. Name\nthe cards and lines that stabilize, rebuild, or steal a win, and say whether its card advantage,\nrecursion, and interaction are enough to recover. Say plainly when it has few ways back.\nIn power_up, lead with the change that most strengthens the thinnest link or most\nunder-represented role, favor synergistic engines over generic staples, and pair each addition\nwith the low-synergy card it should replace. For a proposed Commander finisher, briefly show why\nit can end a game against three opponents with this deck's board and resources. Say when a\nchange would also move the bracket.\nIn power_down, weaken the plan by removing redundancy from multipliers or payoffs and replacing\nsynergistic advantage engines with slower effects, while keeping the objective recognizable.\nIn consistency, judge whether the deck reliably assembles its chain on time: redundancy for\neach link, whether the card draw digs deep enough to find the payoffs, whether the mana comes\nonline when the plan needs it, land count and curve, and whether a typical hand does something\nmeaningful in the first few turns. Distinguish improvements that make the deck more reliable\nfrom those that make it more powerful. Consistency changes must not weaken a thin link or cut a\nfinisher, protection piece, or engine piece to make room. Every consistency item must recommend\na concrete card addition, cut, replacement, or quantity change and explain how it improves\nreliability. Do not include gameplay advice, sequencing tips, mulligan decisions, or other ways\nto pilot the deck in consistency; keep those in game_plan or mulligan_guide as appropriate.\nIn opponent_experience, imagine playing against the deck. Describe whether its turns are quick\nand interactive or long and solitaire-like, and call out potentially frustrating play patterns\nsuch as repeated discard, stax, locks, resource denial, excessive tutoring or shuffling, and\nrepeated or extra turns. The facts.saltiest_cards list contains the five highest available\ncommunity saltiness scores as supporting context; judge the actual cards and deck patterns too.\nIn mulligan_guide, identify the most important cards or opening-hand traits to keep and the\nclearest reasons to mulligan. For Commander, remember that the first mulligan in a multiplayer\ngame is free and that a hand with three to five lands, or [[Sol Ring]] with at least one land,\nusually has enough mana to keep. Do not duplicate this or another standard field in custom_sections.\nIf custom instructions request additional named sections, return each one in custom_sections\nwith a short title and concise Markdown content. Otherwise return an empty custom_sections list.\nIn card_categories, define six to fourteen roles that sort the deck's cards by the job each one\ndoes for this deck's plan, in the order a deck list should show them. Name the deck's own engines\nand payoffs precisely, such as \"Cast-from-exile payoffs\" or \"-1/-1 counter payoffs\", rather than\ngeneric labels, and keep standard roles such as Ramp, Removal, Card advantage, or Lands when the\ndeck has them. Give each role a one-sentence description of which cards belong in it, written so\nthe role can be judged from a single card's text. Say whose cards an effect touches, and when two\nroles share a word such as exile, sacrifice, counters, or tokens, say in each description which\nuse belongs there: removal that exiles an opponent's permanent belongs in a removal role, not in\na role for exiling and returning your own permanents. Do not add a role for the commander or an\nOther role.\n"
        ));
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
            "Consistency changes must not weaken a thin link",
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
            "State its objective as a chain",
            "engine pieces that perform the core action, multipliers",
            "fewer cards in whatever role the commander fills",
            "Prefer synergy over generic staples",
            "Size interaction to the plan",
            "remove the lowest-synergy cards from over-represented roles first",
            "In power_up, lead with the change that most strengthens the thinnest link",
            "pair each addition with the low-synergy card it should replace",
            "In consistency, judge whether the deck reliably assembles its chain on time",
            "Every consistency item must recommend a concrete card addition, cut, replacement, or quantity change",
            "Do not include gameplay advice, sequencing tips, mulligan decisions, or other ways to pilot the deck in consistency",
        ] {
            assert!(prompt.contains(expected), "{expected}");
        }
        assert!(!prompt.contains("required by the literal Commander Brackets guidelines"));
        assert!(!prompt.contains("sweepers that leave its board intact"));

        let user_prompt = squashed(&user(
            &json!({"deck": {"format": "commander", "cards": []}, "facts": {}}),
        ));
        assert!(user_prompt.contains("multiplayer deck that must defeat"));
        assert!(user_prompt.contains("Identify its objective chain"));
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
