//! Deck question validation, prompts, and answer normalization
//! (`AI.DeckQuestion`).

use serde::Serialize;
use serde_json::{Value, json};

use crate::ai::prompt_text::{QUESTION_SYSTEM, SWAP_CHAT_INSTRUCTIONS};

const MAX_QUESTION_LENGTH: usize = 1_000;
const MAX_THREAD_ID_LENGTH: usize = 64;
const MAX_STAGED_NAMES: usize = 100;
const MAX_CARD_NAME_LENGTH: usize = 200;

const EMPTY_QUESTION: &str = "Enter a question about this deck.";
const INVALID_THREAD: &str = "The chat thread id is invalid.";
const INVALID_SWAP: &str = "The staged swap is invalid.";
const EMPTY_ANSWER: &str = "The AI provider returned an empty answer.";
const INVALID_ANSWER: &str = "The AI provider returned an invalid answer.";

/// `validate/1`: the trimmed question.
pub fn validate(question: &str) -> Result<String, String> {
    let question = question.trim();
    if question.is_empty() {
        Err(EMPTY_QUESTION.to_owned())
    } else if question.chars().count() > MAX_QUESTION_LENGTH {
        Err("Keep the question under 1,000 characters.".to_owned())
    } else {
        Ok(question.to_owned())
    }
}

/// `validate_thread_id/1`, also used for conversation ids.
pub fn validate_thread_id(id: Option<&str>) -> Result<Option<String>, String> {
    let Some(id) = id else { return Ok(None) };
    let id = id.trim();
    if id.is_empty() || id.chars().count() > MAX_THREAD_ID_LENGTH {
        Err(INVALID_THREAD.to_owned())
    } else {
        Ok(Some(id.to_owned()))
    }
}

/// The card names staged in the Swap cards workbench. Serialized in this
/// field order for prompts (`Jason.OrderedObject`).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SwapContext {
    pub cuts: Vec<String>,
    pub adds: Vec<String>,
}

impl SwapContext {
    /// The stored JSON (`%{"cuts" => ..., "adds" => ...}`).
    #[must_use]
    pub fn to_json(&self) -> Value {
        json!({"cuts": self.cuts, "adds": self.adds})
    }

    /// Reads stored JSON; missing or malformed lists read as empty.
    #[must_use]
    pub fn from_json(value: &Value) -> Self {
        let names = |key: &str| -> Vec<String> {
            value
                .get(key)
                .and_then(Value::as_array)
                .map(|names| {
                    names
                        .iter()
                        .filter_map(|name| name.as_str().map(str::to_owned))
                        .collect()
                })
                .unwrap_or_default()
        };
        Self {
            cuts: names("cuts"),
            adds: names("adds"),
        }
    }
}

fn staged_names(names: &[String]) -> Option<Vec<String>> {
    (names.len() <= MAX_STAGED_NAMES
        && names
            .iter()
            .all(|name| name.chars().count() <= MAX_CARD_NAME_LENGTH))
    .then(|| normalize_card_names(names))
}

/// `validate_swap_context/1`: normalized staged names, or `None` when
/// nothing is staged.
pub fn validate_swap_context(
    context: Option<(&[String], &[String])>,
) -> Result<Option<SwapContext>, String> {
    let Some((cuts, adds)) = context else {
        return Ok(None);
    };
    let (Some(cuts), Some(adds)) = (staged_names(cuts), staged_names(adds)) else {
        return Err(INVALID_SWAP.to_owned());
    };
    if cuts.is_empty() && adds.is_empty() {
        Ok(None)
    } else {
        Ok(Some(SwapContext { cuts, adds }))
    }
}

/// Trims, drops blanks, and removes case-insensitive duplicates.
#[must_use]
pub fn normalize_card_names<S: AsRef<str>>(names: &[S]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    names
        .iter()
        .map(|name| name.as_ref().trim())
        .filter(|name| !name.is_empty())
        .filter(|name| seen.insert(name.to_lowercase()))
        .map(str::to_owned)
        .collect()
}

/// `system_prompt/0`.
#[must_use]
pub fn system_prompt() -> &'static str {
    QUESTION_SYSTEM
}

/// `swap_chat_instructions/0`: extra system instructions for Swap cards
/// chat threads.
#[must_use]
pub fn swap_chat_instructions() -> &'static str {
    SWAP_CHAT_INSTRUCTIONS
}

#[derive(Serialize)]
struct StagedSwap<'a> {
    staged_swap: &'a SwapContext,
}

/// `user_prompt/3`: the question, any staged swap, and the deck data.
#[must_use]
pub fn user_prompt(question: &str, payload: &Value, swap_context: Option<&SwapContext>) -> String {
    let staged = swap_context.map_or_else(String::new, |context| {
        let encoded = serde_json::to_string(&StagedSwap {
            staged_swap: context,
        })
        .unwrap_or_default();
        format!("\nStaged swap:\n{encoded}\n")
    });
    format!("Question:\n{question}\n{staged}\nDeck data:\n{payload}\n")
}

/// `correction_prompt/2`: the question again with the failed catalog checks.
#[must_use]
pub fn correction_prompt(question: &str, issues: &[String]) -> String {
    let issues = issues
        .iter()
        .map(|issue| format!("- {issue}"))
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "{question}\n\nThe previous draft failed ManaVault's catalog checks:\n{issues}\n\nProduce a corrected answer that does not make those invalid recommendations. Keep every\noriginal user constraint.\n"
    )
}

/// `response_schema/0`.
#[must_use]
pub fn response_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "answer": {"type": "string"},
            "recommended_cuts": {"type": "array", "items": {"type": "string"}},
            "recommended_additions": {"type": "array", "items": {"type": "string"}}
        },
        "required": ["answer", "recommended_cuts", "recommended_additions"]
    })
}

/// A normalized answer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Answer {
    pub answer: String,
    pub recommended_cuts: Vec<String>,
    pub recommended_additions: Vec<String>,
}

fn card_names(value: Option<&Value>) -> Option<Vec<String>> {
    value?
        .as_array()?
        .iter()
        .map(|name| name.as_str().map(str::to_owned))
        .collect()
}

/// `normalize_result/1`.
pub fn normalize_result(result: &Value) -> Result<Answer, String> {
    let Some(map) = result.as_object() else {
        return Err(INVALID_ANSWER.to_owned());
    };
    let answer = map
        .get("answer")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|answer| !answer.is_empty())
        .ok_or_else(|| EMPTY_ANSWER.to_owned())?;
    let (Some(cuts), Some(additions)) = (
        card_names(map.get("recommended_cuts")),
        card_names(map.get("recommended_additions")),
    ) else {
        return Err(INVALID_ANSWER.to_owned());
    };
    Ok(Answer {
        answer: answer.to_owned(),
        recommended_cuts: normalize_card_names(&cuts),
        recommended_additions: normalize_card_names(&additions),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_and_trims_deck_questions() {
        assert_eq!(
            validate("  Would Doubling Season fit?  "),
            Ok("Would Doubling Season fit?".to_owned())
        );
        assert_eq!(validate("  "), Err(EMPTY_QUESTION.to_owned()));
        assert_eq!(
            validate(&"a".repeat(1_001)),
            Err("Keep the question under 1,000 characters.".to_owned())
        );
        assert!(validate(&"é".repeat(1_000)).is_ok());
    }

    #[test]
    fn frames_deck_data_and_the_question_as_untrusted_input() {
        let prompt = user_prompt(
            "What should I cut?",
            &json!({"deck": {"name": "Value deck", "cards": [{"name": "Sol Ring"}]}}),
            None,
        );
        let system = system_prompt();
        for expected in [
            "untrusted data",
            "commander_color_identity",
            "off-color or format-illegal card",
            "Honor every explicit constraint",
            "authoritative metadata calculated by ManaVault",
            "[[Doubling Season]]",
            "GitHub-Flavored Markdown",
        ] {
            assert!(system.contains(expected), "{expected}");
        }
        assert_eq!(
            prompt,
            "Question:\nWhat should I cut?\n\nDeck data:\n{\"deck\":{\"cards\":[{\"name\":\"Sol Ring\"}],\"name\":\"Value deck\"}}\n"
        );
    }

    #[test]
    fn normalizes_structured_answers_and_exposes_a_strict_schema() {
        let result = normalize_result(&json!({
            "answer": "  Cut [[Solemn Simulacrum]] for [[Sun Titan]].  ",
            "recommended_cuts": [" Solemn Simulacrum ", "solemn simulacrum", ""],
            "recommended_additions": [" Sun Titan ", "Sun Titan", ""]
        }))
        .unwrap();
        assert_eq!(
            result,
            Answer {
                answer: "Cut [[Solemn Simulacrum]] for [[Sun Titan]].".into(),
                recommended_cuts: vec!["Solemn Simulacrum".into()],
                recommended_additions: vec!["Sun Titan".into()],
            }
        );
        let schema = response_schema();
        assert_eq!(schema["additionalProperties"], false);
        assert_eq!(
            schema["required"],
            json!(["answer", "recommended_cuts", "recommended_additions"])
        );
        assert_eq!(
            normalize_result(
                &json!({"answer": "  ", "recommended_cuts": [], "recommended_additions": []})
            ),
            Err(EMPTY_ANSWER.to_owned())
        );
        assert_eq!(
            normalize_result(
                &json!({"answer": "ok", "recommended_cuts": [1], "recommended_additions": []})
            ),
            Err(INVALID_ANSWER.to_owned())
        );
        assert_eq!(
            normalize_result(&json!({"answer": "ok", "recommended_cuts": []})),
            Err(INVALID_ANSWER.to_owned())
        );
    }

    #[test]
    fn normalizes_staged_swap_context_and_thread_ids() {
        let empty: Vec<String> = vec![];
        assert_eq!(validate_swap_context(None), Ok(None));
        assert_eq!(validate_swap_context(Some((&empty, &empty))), Ok(None));
        let cuts = vec![" Sol Ring ".to_owned(), "sol ring".to_owned()];
        let adds = vec!["Mother of Runes".to_owned()];
        assert_eq!(
            validate_swap_context(Some((&cuts, &adds))),
            Ok(Some(SwapContext {
                cuts: vec!["Sol Ring".into()],
                adds: vec!["Mother of Runes".into()]
            }))
        );
        let too_many = vec!["x".to_owned(); 101];
        assert_eq!(
            validate_swap_context(Some((&too_many, &empty))),
            Err(INVALID_SWAP.to_owned())
        );
        let too_long = vec!["x".repeat(201)];
        assert_eq!(
            validate_swap_context(Some((&empty, &too_long))),
            Err(INVALID_SWAP.to_owned())
        );
        assert_eq!(
            validate_thread_id(Some(" thread-1 ")),
            Ok(Some("thread-1".into()))
        );
        assert!(validate_thread_id(Some(&"a".repeat(65))).is_err());
        assert!(validate_thread_id(Some("  ")).is_err());
        assert_eq!(validate_thread_id(None), Ok(None));
    }

    #[test]
    fn includes_the_staged_swap_in_threaded_prompts() {
        let context = SwapContext {
            cuts: vec!["Pia Nalaar".into()],
            adds: vec![],
        };
        let prompt = user_prompt(
            "What replaces it?",
            &json!({"deck": {"cards": []}}),
            Some(&context),
        );
        assert!(prompt.contains(r#""staged_swap":{"cuts":["Pia Nalaar"],"adds":[]}"#));
        assert!(prompt.starts_with("Question:\nWhat replaces it?\n\nStaged swap:\n{"));
        assert!(swap_chat_instructions().contains("under 120 words"));
        assert!(!user_prompt("Q", &json!({"deck": {"cards": []}}), None).contains("staged_swap"));
        assert_eq!(
            correction_prompt("Q?", &["a".into(), "b".into()]),
            "Q?\n\nThe previous draft failed ManaVault's catalog checks:\n- a\n- b\n\nProduce a corrected answer that does not make those invalid recommendations. Keep every\noriginal user constraint.\n"
        );
    }
}
