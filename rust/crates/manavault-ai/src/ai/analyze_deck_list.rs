//! Analyzing a pasted decklist or a deck link inline and saving the result
//! (`AI.AnalyzeDeckList`).

use super::analyze_deck::analyze_payload;
use super::deck_analysis::{self, PayloadDeck};
use super::decks::DeckCardInput;
use super::requests::{self, DeckAnalysisRequest, FORMATS, InsertError, NewRequest, SourceType};
use super::{AiError, Configured};
use manavault_catalog::catalog::search::cards_by_name;
use manavault_core::state::AppState;
use manavault_trade::trade::list_source::{self, ListEntry, ResolveError};

/// `analyzeDeckList` arguments.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Args {
    pub url: Option<String>,
    pub text: Option<String>,
    pub format: String,
}

fn source(args: &Args) -> Result<(SourceType, String), AiError> {
    let present = |value: &Option<String>| {
        value
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_owned)
    };
    let error = |message: &str| Err(AiError::User(message.to_owned()));
    match (present(&args.text), present(&args.url)) {
        (Some(text), _) if text.chars().count() <= 200_000 => Ok((SourceType::Text, text)),
        (Some(_), _) => error("The pasted decklist is too large."),
        (None, Some(url)) if url.chars().count() <= 2_000 => Ok((SourceType::Url, url)),
        (None, Some(_)) => error("The deck link is too long."),
        (None, None) => error("Paste a decklist or a supported link to analyze."),
    }
}

fn unrecognized_message(names: &[String]) -> String {
    let mut unique: Vec<&String> = Vec::new();
    for name in names {
        if !unique.contains(&name) {
            unique.push(name);
        }
    }
    let shown = unique
        .iter()
        .take(5)
        .map(|name| name.as_str())
        .collect::<Vec<_>>()
        .join(", ");
    let suffix = if unique.len() > 5 {
        format!(" and {} more", unique.len() - 5)
    } else {
        String::new()
    };
    format!(
        "These cards are not in the local catalog: {shown}{suffix}. Sync the catalog or correct the list and try again."
    )
}

/// `external_deck_cards/1`: resolves every entry against the catalog;
/// fails on unknown names or a list with no mainboard or commander cards.
async fn external_deck_cards(
    state: &AppState,
    entries: &[ListEntry],
) -> Result<Vec<DeckCardInput>, AiError> {
    let names: Vec<&str> = entries.iter().map(|entry| entry.name.as_str()).collect();
    let cards = cards_by_name::by_names(&state.db, &names).await?;
    let mut deck_cards = Vec::new();
    let mut unrecognized = Vec::new();
    for entry in entries {
        match cards.get(&cards_by_name::key(&entry.name)) {
            Some(card) => deck_cards.push(DeckCardInput {
                card: card.clone(),
                quantity: entry.quantity,
                zone: entry.zone,
            }),
            None => unrecognized.push(entry.name.clone()),
        }
    }
    if !unrecognized.is_empty() {
        return Err(AiError::User(unrecognized_message(&unrecognized)));
    }
    if !deck_cards
        .iter()
        .any(DeckCardInput::counts_toward_deck_total)
    {
        return Err(AiError::User(
            "The decklist does not contain any mainboard or commander cards.".to_owned(),
        ));
    }
    Ok(deck_cards)
}

fn source_name(name: Option<&str>, source_type: SourceType) -> String {
    match name.map(str::trim).filter(|name| !name.is_empty()) {
        Some(name) => name.chars().take(200).collect(),
        None => match source_type {
            SourceType::Url => "Linked decklist".to_owned(),
            SourceType::Text => "Pasted decklist".to_owned(),
        },
    }
}

/// `run/1`.
pub async fn run(state: &AppState, args: &Args) -> Result<DeckAnalysisRequest, AiError> {
    let (source_type, source) = source(args)?;
    if !FORMATS.contains(&args.format.as_str()) {
        return Err(AiError::User("Choose a supported deck format.".to_owned()));
    }
    let settings = Configured::load(state).await?;
    // `Trade.Lists.resolve/1`, like every other list import.
    let (url, text) = match source_type {
        SourceType::Url => (Some(source.as_str()), None),
        SourceType::Text => (None, Some(source.as_str())),
    };
    let resolved = list_source::resolve(&state.db, &state.config, url, text)
        .await
        .map_err(|error| match error {
            ResolveError::User(message) => AiError::User(message.to_owned()),
            ResolveError::Db(error) => error.into(),
        })?;
    let deck_cards = external_deck_cards(state, &resolved.entries).await?;
    let name = source_name(resolved.source_name.as_deref(), source_type);
    let payload = deck_analysis::payload(
        &PayloadDeck {
            name: &name,
            format: &args.format,
            primer: None,
        },
        &deck_cards,
    );
    let analysis = analyze_payload(state, &settings, &payload).await?;
    let request = NewRequest {
        source_type,
        source,
        source_name: name,
        format: args.format.clone(),
        analysis: deck_analysis::render_markdown(&analysis),
        model: settings.model,
        commander_bracket: analysis.official_bracket,
        commander_bracket_estimate: analysis.play_bracket,
        commander_bracket_rating: analysis.bracket_rating,
    };
    match requests::insert(&state.db, &request).await {
        Ok(saved) => Ok(saved),
        Err(InsertError::Invalid(errors)) => Err(AiError::User(errors.to_string())),
        Err(InsertError::Db(error)) => Err(error.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chooses_text_over_links_and_validates_sizes() {
        let args = |url: Option<&str>, text: Option<&str>| Args {
            url: url.map(str::to_owned),
            text: text.map(str::to_owned),
            format: "commander".into(),
        };
        assert!(matches!(
            source(&args(Some("https://x"), Some(" 1 Sol Ring "))),
            Ok((SourceType::Text, ref text)) if text == "1 Sol Ring"
        ));
        assert!(matches!(
            source(&args(Some(" /share/decks/t "), Some("  "))),
            Ok((SourceType::Url, ref url)) if url == "/share/decks/t"
        ));
        let message = |result: Result<(SourceType, String), AiError>| match result {
            Err(AiError::User(message)) => message,
            other => format!("{other:?}"),
        };
        assert_eq!(
            message(source(&args(None, Some(&"a".repeat(200_001))))),
            "The pasted decklist is too large."
        );
        assert_eq!(
            message(source(&args(Some(&"a".repeat(2_001)), None))),
            "The deck link is too long."
        );
        assert_eq!(
            message(source(&args(None, None))),
            "Paste a decklist or a supported link to analyze."
        );
    }

    #[test]
    fn names_fall_back_and_unknown_cards_are_summarized() {
        assert_eq!(source_name(Some("  "), SourceType::Url), "Linked decklist");
        assert_eq!(source_name(None, SourceType::Text), "Pasted decklist");
        assert_eq!(
            source_name(Some(&"é".repeat(300)), SourceType::Text)
                .chars()
                .count(),
            200
        );
        let names: Vec<String> = ["A", "B", "A", "C", "D", "E", "F", "G"]
            .iter()
            .map(|name| (*name).to_owned())
            .collect();
        assert_eq!(
            unrecognized_message(&names),
            "These cards are not in the local catalog: A, B, C, D, E and 2 more. Sync the catalog or correct the list and try again."
        );
    }
}
