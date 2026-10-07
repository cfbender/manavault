//! Validating, normalizing, and rendering a structured deck analysis
//! (`AI.DeckAnalysis.Result`), including the Commander bracket rating.

use serde_json::{Map, Value};

use super::prompt::custom_instructions;

const INVALID: &str = "The AI provider returned an invalid analysis.";
const INCOMPLETE: &str = "The AI provider returned an incomplete analysis.";
const INVALID_BRACKET: &str = "The AI provider returned an invalid Commander bracket.";

/// A requested extra section.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CustomSection {
    pub title: String,
    pub content: String,
}

/// A validated analysis. The bracket fields are `None` outside Commander.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Analysis {
    pub summary: String,
    pub themes: Vec<String>,
    pub game_plan: String,
    pub opponent_experience: String,
    pub strengths: Vec<String>,
    pub weaknesses: Vec<String>,
    /// The official bracket, raised to the Game Changer minimum.
    pub official_bracket: Option<i64>,
    pub play_bracket: Option<i64>,
    /// The overall rating such as `"3-"`, `"3"`, or `"3+"`.
    pub bracket_rating: Option<String>,
    pub bracket_rationale: String,
    pub power_up: Vec<String>,
    pub power_down: Vec<String>,
    pub consistency: Vec<String>,
    pub mulligan_guide: Vec<String>,
    pub custom_sections: Vec<CustomSection>,
}

fn field<'a>(map: &'a Map<String, Value>, key: &str) -> Option<&'a Value> {
    map.get(key).filter(|value| !value.is_null())
}

fn string(map: &Map<String, Value>, key: &str) -> Option<String> {
    field(map, key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

fn string_list(map: &Map<String, Value>, key: &str) -> Option<Vec<String>> {
    let values = field(map, key)?.as_array()?;
    values
        .iter()
        .map(|value| value.as_str().map(str::trim))
        .collect::<Option<Vec<&str>>>()
        .map(|values| {
            values
                .into_iter()
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
                .collect()
        })
}

fn custom_sections(map: &Map<String, Value>) -> Option<Vec<CustomSection>> {
    field(map, "custom_sections")?
        .as_array()?
        .iter()
        .map(|section| {
            let section = section.as_object()?;
            Some(CustomSection {
                title: string(section, "title")?,
                content: string(section, "content")?,
            })
        })
        .collect()
}

fn bracket(map: &Map<String, Value>, key: &str) -> Option<i64> {
    field(map, key)
        .and_then(Value::as_i64)
        .filter(|value| (1..=5).contains(value))
}

/// Whether `rating` is `[1-5]` with an optional `+` or `-`.
#[must_use]
pub fn valid_rating(rating: &str) -> bool {
    let mut chars = rating.chars();
    matches!(chars.next(), Some('1'..='5'))
        && matches!(
            (chars.next(), chars.next()),
            (None, _) | (Some('+' | '-'), None)
        )
}

fn game_changer_minimum(count: i64) -> i64 {
    match count {
        i64::MIN..=0 => 1,
        1..=3 => 3,
        _ => 4,
    }
}

fn corrected_rationale(count: i64, minimum: i64, practical: i64) -> String {
    let game_changers = if count == 1 {
        "1 Game Changer".to_owned()
    } else {
        format!("{count} Game Changers")
    };
    format!(
        "The official Commander Brackets guidelines require at least Bracket {minimum} because the deck contains {game_changers}. Based on the rest of the list, it is expected to play like Bracket {practical}."
    )
}

/// `Result.normalize/3`: checks every field, trims text, drops blank list
/// items, drops custom sections unless custom instructions asked for them,
/// and settles the brackets. Commander decks need valid brackets and a
/// rating, and the official bracket is raised to the Game Changer minimum
/// (with a rationale saying so); other formats have no brackets.
pub fn normalize(
    result: &Value,
    format: &str,
    game_changer_count: i64,
    instructions: Option<&str>,
) -> Result<Analysis, String> {
    let map = result.as_object().ok_or_else(|| INVALID.to_owned())?;
    let incomplete = || INCOMPLETE.to_owned();
    let mut analysis = Analysis {
        summary: string(map, "summary").ok_or_else(incomplete)?,
        game_plan: string(map, "game_plan").ok_or_else(incomplete)?,
        opponent_experience: string(map, "opponent_experience").ok_or_else(incomplete)?,
        bracket_rationale: string(map, "bracket_rationale").ok_or_else(incomplete)?,
        themes: string_list(map, "themes").ok_or_else(incomplete)?,
        strengths: string_list(map, "strengths").ok_or_else(incomplete)?,
        weaknesses: string_list(map, "weaknesses").ok_or_else(incomplete)?,
        power_up: string_list(map, "power_up").ok_or_else(incomplete)?,
        power_down: string_list(map, "power_down").ok_or_else(incomplete)?,
        consistency: string_list(map, "consistency").ok_or_else(incomplete)?,
        mulligan_guide: string_list(map, "mulligan_guide").ok_or_else(incomplete)?,
        custom_sections: custom_sections(map).ok_or_else(incomplete)?,
        official_bracket: None,
        play_bracket: None,
        bracket_rating: None,
    };
    if custom_instructions(instructions).is_none() {
        analysis.custom_sections.clear();
    }
    if format != "commander" {
        return Ok(analysis);
    }
    let official = bracket(map, "official_bracket");
    let practical = bracket(map, "play_bracket");
    let rating = field(map, "bracket_rating")
        .and_then(Value::as_str)
        .filter(|rating| valid_rating(rating));
    let (Some(official), Some(practical), Some(rating)) = (official, practical, rating) else {
        return Err(INVALID_BRACKET.to_owned());
    };
    let minimum = game_changer_minimum(game_changer_count);
    if official < minimum {
        analysis.bracket_rationale = corrected_rationale(game_changer_count, minimum, practical);
    }
    analysis.official_bracket = Some(official.max(minimum));
    analysis.play_bracket = Some(practical);
    analysis.bracket_rating = Some(rating.to_owned());
    Ok(analysis)
}

/// `Result.bracket_label/3`: the rating when present; otherwise, for older
/// analyses without one, the higher of two differing brackets with a minus.
#[must_use]
pub fn bracket_label(official: i64, practical: Option<i64>, rating: Option<&str>) -> String {
    if let Some(rating) = rating {
        return format!("Bracket {rating}");
    }
    match practical {
        Some(practical) if (1..=5).contains(&practical) && practical != official => {
            format!("Bracket {}-", official.max(practical))
        }
        _ => format!("Bracket {official}"),
    }
}

fn section(title: &str, content: &str) -> String {
    format!("## {title}\n\n{content}")
}

fn list_section(title: &str, items: &[String]) -> String {
    let content = if items.is_empty() {
        "No specific changes recommended.".to_owned()
    } else {
        items
            .iter()
            .map(|item| format!("- {item}"))
            .collect::<Vec<_>>()
            .join("\n")
    };
    section(title, &content)
}

fn bracket_section(analysis: &Analysis) -> String {
    match analysis.official_bracket {
        None => analysis.bracket_rationale.clone(),
        Some(official) => format!(
            "**{}**\n\nOfficial WotC bracket: {official}.\n\n{}",
            bracket_label(
                official,
                analysis.play_bracket,
                analysis.bracket_rating.as_deref()
            ),
            analysis.bracket_rationale
        ),
    }
}

/// `Result.render_markdown/1`: the saved Markdown analysis.
#[must_use]
pub fn render_markdown(analysis: &Analysis) -> String {
    let mut sections = vec![
        section("Overview", &analysis.summary),
        list_section("Goals and themes", &analysis.themes),
        section("How it plays", &analysis.game_plan),
        section(
            "What it's like to play against it",
            &analysis.opponent_experience,
        ),
        section("Bracket read", &bracket_section(analysis)),
        list_section("Strengths", &analysis.strengths),
        list_section("Pressure points", &analysis.weaknesses),
        list_section("Ways to power it up", &analysis.power_up),
        list_section("Ways to power it down", &analysis.power_down),
        list_section("Consistency improvements", &analysis.consistency),
        list_section("Mulligan guide", &analysis.mulligan_guide),
    ];
    sections.extend(
        analysis
            .custom_sections
            .iter()
            .map(|custom| section(&custom.title, &custom.content)),
    );
    sections.join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn result() -> Value {
        json!({
            "summary": "A focused tempo deck.",
            "themes": ["Tempo"],
            "game_plan": "Apply pressure while interacting.",
            "opponent_experience": "Its turns are quick and leave room for interaction.",
            "strengths": ["Efficient threats"],
            "weaknesses": ["Limited late game"],
            "official_bracket": 2,
            "play_bracket": 3,
            "bracket_rating": "3+",
            "bracket_rationale": "The list plays above its card-based minimum.",
            "power_up": ["Add stronger interaction"],
            "power_down": ["Use slower threats"],
            "consistency": ["Tighten the curve"],
            "mulligan_guide": ["Keep an early threat and interaction"],
            "custom_sections": []
        })
    }

    fn with(overrides: &Value) -> Value {
        let mut base = result();
        for (key, value) in overrides.as_object().unwrap() {
            base[key] = value.clone();
        }
        base
    }

    #[test]
    fn preserves_linked_card_references_in_rendered_analysis() {
        let response = with(&json!({
            "summary": "Recur [[Sun Titan]].",
            "power_up": ["Add [[Emeria, the Sky Ruin]]."],
            "custom_sections": [{"title": "Budget", "content": "Try [[Sevinne's Reclamation]]."}]
        }));
        let analysis = normalize(&response, "commander", 0, Some("Include Budget")).unwrap();
        let markdown = render_markdown(&analysis);
        assert!(markdown.contains("## Overview\n\nRecur [[Sun Titan]]."));
        assert!(markdown.contains("- Add [[Emeria, the Sky Ruin]]."));
        assert!(markdown.contains("## Budget\n\nTry [[Sevinne's Reclamation]]."));
    }

    #[test]
    fn preserves_practical_differences_while_enforcing_game_changer_minimums() {
        let analysis = normalize(&result(), "commander", 1, None).unwrap();
        assert_eq!(analysis.official_bracket, Some(3));
        assert_eq!(analysis.play_bracket, Some(3));
        assert!(
            analysis
                .bracket_rationale
                .contains("require at least Bracket 3")
        );
        assert!(analysis.bracket_rationale.contains("1 Game Changer"));
        assert!(analysis.bracket_rationale.contains("play like Bracket 3."));

        let weaker = normalize(&with(&json!({"play_bracket": 2})), "commander", 1, None).unwrap();
        assert_eq!(
            bracket_label(weaker.official_bracket.unwrap(), weaker.play_bracket, None),
            "Bracket 3-"
        );
        let many = normalize(&result(), "commander", 5, None).unwrap();
        assert_eq!(many.official_bracket, Some(4));
        assert!(many.bracket_rationale.contains("5 Game Changers"));
        let enough =
            normalize(&with(&json!({"official_bracket": 4})), "commander", 5, None).unwrap();
        assert_eq!(
            enough.bracket_rationale,
            "The list plays above its card-based minimum."
        );
    }

    #[test]
    fn renders_independent_placement_with_official_guidance_in_the_body() {
        for rating in ["3-", "3", "3+"] {
            let response = with(&json!({
                "official_bracket": 3,
                "play_bracket": 3,
                "bracket_rating": rating,
                "bracket_rationale": "Its engines support a turn-eight win with limited redundancy."
            }));
            let analysis = normalize(&response, "commander", 0, None).unwrap();
            assert_eq!(analysis.bracket_rating.as_deref(), Some(rating));
            assert_eq!(
                bracket_label(3, Some(3), Some(rating)),
                format!("Bracket {rating}")
            );
            assert!(render_markdown(&analysis).contains(&format!(
                "## Bracket read\n\n**Bracket {rating}**\n\nOfficial WotC bracket: 3.\n\nIts engines support a turn-eight win with limited redundancy."
            )));
        }
    }

    #[test]
    fn legacy_labels_use_the_higher_bracket_with_a_minus() {
        assert_eq!(bracket_label(2, Some(3), None), "Bracket 3-");
        assert_eq!(bracket_label(4, Some(3), None), "Bracket 4-");
        assert_eq!(bracket_label(3, Some(3), None), "Bracket 3");
        assert_eq!(bracket_label(3, None, None), "Bracket 3");
        assert_eq!(bracket_label(2, Some(3), Some("3+")), "Bracket 3+");
    }

    #[test]
    fn requires_a_valid_explicit_commander_rating_and_brackets() {
        for rating in [
            Value::Null,
            json!(""),
            json!("0"),
            json!("6-"),
            json!("3++"),
            json!("3+\n"),
            json!(3),
        ] {
            assert_eq!(
                normalize(
                    &with(&json!({"bracket_rating": rating})),
                    "commander",
                    0,
                    None
                ),
                Err(INVALID_BRACKET.to_owned())
            );
        }
        for bracket in [json!(0), json!(6), json!(2.5), json!("2"), Value::Null] {
            assert_eq!(
                normalize(
                    &with(&json!({"official_bracket": bracket})),
                    "commander",
                    0,
                    None
                ),
                Err(INVALID_BRACKET.to_owned())
            );
        }
    }

    #[test]
    fn commander_brackets_do_not_apply_to_other_formats() {
        let analysis =
            normalize(&with(&json!({"bracket_rating": "nope"})), "modern", 4, None).unwrap();
        assert_eq!(
            (
                analysis.official_bracket,
                analysis.play_bracket,
                analysis.bracket_rating.clone()
            ),
            (None, None, None)
        );
        assert_eq!(
            render_markdown(&analysis)
                .split("## Bracket read\n\n")
                .nth(1)
                .unwrap()
                .split("\n\n")
                .next(),
            Some("The list plays above its card-based minimum.")
        );
    }

    #[test]
    fn rejects_incomplete_or_invalid_structured_responses() {
        assert_eq!(
            normalize(&json!({"summary": "Only a summary"}), "commander", 0, None),
            Err(INCOMPLETE.to_owned())
        );
        assert_eq!(
            normalize(&with(&json!({"summary": "  "})), "commander", 0, None),
            Err(INCOMPLETE.to_owned())
        );
        assert_eq!(
            normalize(&with(&json!({"themes": ["ok", 1]})), "commander", 0, None),
            Err(INCOMPLETE.to_owned())
        );
        assert_eq!(
            normalize(
                &with(&json!({"custom_sections": [{"title": "T", "content": " "}]})),
                "commander",
                0,
                Some("x")
            ),
            Err(INCOMPLETE.to_owned())
        );
        assert_eq!(
            normalize(&json!(["list"]), "commander", 0, None),
            Err(INVALID.to_owned())
        );
    }

    #[test]
    fn trims_values_and_keeps_custom_sections_only_with_instructions() {
        let response = with(&json!({
            "themes": ["  Tempo ", "  "],
            "custom_sections": [{"title": "  Budget upgrades  ", "content": "  - Start with [[Counterspell]].  "}]
        }));
        let analysis = normalize(
            &response,
            "modern",
            0,
            Some("Add a budget upgrades section."),
        )
        .unwrap();
        assert_eq!(analysis.themes, vec!["Tempo".to_owned()]);
        assert_eq!(
            analysis.custom_sections,
            vec![CustomSection {
                title: "Budget upgrades".into(),
                content: "- Start with [[Counterspell]].".into()
            }]
        );
        assert!(
            render_markdown(&analysis)
                .ends_with("## Budget upgrades\n\n- Start with [[Counterspell]].")
        );
        assert_eq!(
            normalize(&response, "modern", 0, None)
                .unwrap()
                .custom_sections,
            vec![]
        );
        let empty = normalize(&with(&json!({"power_down": []})), "modern", 0, None).unwrap();
        assert!(
            render_markdown(&empty)
                .contains("## Ways to power it down\n\nNo specific changes recommended.")
        );
    }
}
