//! Deck analysis: the provider payload, prompts and schema, and result
//! normalization (`AI.DeckAnalysis`).

pub mod payload;
pub mod prompt;
pub mod result;

pub use payload::{Payload, PayloadDeck, build as payload};
pub use result::{Analysis, bracket_label, normalize as normalize_result, render_markdown};
