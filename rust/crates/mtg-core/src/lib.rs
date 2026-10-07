//! Magic: The Gathering domain types shared by ManaVault and the-gathering.
//!
//! Enable the `sqlx` feature to store these types in SQLite columns. Text
//! values match what the Elixir apps write today.

/// Scryfall's identifier for a card's rules text, shared by all its printings.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[cfg_attr(feature = "sqlx", derive(sqlx::Type), sqlx(transparent))]
pub struct OracleId(String);

/// Scryfall's identifier for one printing of a card.
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[cfg_attr(feature = "sqlx", derive(sqlx::Type), sqlx(transparent))]
pub struct ScryfallId(String);

macro_rules! string_id {
    ($name:ident) => {
        impl $name {
            pub fn new(value: impl Into<String>) -> Self {
                Self(value.into())
            }

            #[must_use]
            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str(&self.0)
            }
        }
    };
}

string_id!(OracleId);
string_id!(ScryfallId);

/// The surface treatment of a physical card.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "sqlx", derive(sqlx::Type), sqlx(rename_all = "snake_case"))]
pub enum Finish {
    Nonfoil,
    Foil,
    Etched,
}

/// Physical card condition, using the grading scale common to US vendors.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[cfg_attr(feature = "sqlx", derive(sqlx::Type), sqlx(rename_all = "snake_case"))]
pub enum Condition {
    NearMint,
    LightlyPlayed,
    ModeratelyPlayed,
    HeavilyPlayed,
    Damaged,
}

/// Whether a Scryfall type line has the Basic supertype on a land, such as
/// `"Basic Land — Plains"`, `"Basic Snow Land — Forest"`, or `"Basic Land"`
/// (Wastes).
#[must_use]
pub fn is_basic_land(type_line: &str) -> bool {
    let types = type_line.split('—').next().unwrap_or_default();
    let has = |word: &str| types.split_whitespace().any(|w| w == word);
    has("Basic") && has("Land")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_land_type_lines() {
        assert!(is_basic_land("Basic Land — Plains"));
        assert!(is_basic_land("Basic Snow Land — Forest"));
        assert!(is_basic_land("Basic Land"));
        assert!(!is_basic_land("Snow Land — Forest Island"));
        assert!(!is_basic_land("Legendary Land"));
        assert!(!is_basic_land("Artifact — Basic"));
    }
}
