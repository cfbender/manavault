//! Scryfall oracle tags: which tags a card carries, the deck themes they
//! imply, and the deck category a card is grouped under
//! (`Manavault.Catalog.ScryfallOracleTags`).
//!
//! The input is Scryfall's `oracle-tags` bulk file, kept as raw JSON: tag
//! fields are read leniently, exactly as the Elixir module read string-keyed
//! maps, so an odd tag never fails a catalog import.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use serde_json::Value;

/// Type-line words that become themes.
const TYPE_THEMES: [(&str, &str); 7] = [
    ("land", "land"),
    ("creature", "creature"),
    ("artifact", "artifact"),
    ("enchantment", "enchantment"),
    ("instant", "instant"),
    ("sorcery", "sorcery"),
    ("planeswalker", "planeswalker"),
];

/// Normalized tag names (slug, label, or alias) and the theme each maps to.
fn theme_alias(name: &str) -> Option<&'static str> {
    Some(match name {
        "aristocrats" => "aristocrats",
        "artifact" | "artifacts" => "artifact",
        "aura" | "auras" => "auras",
        "blink" | "blinks" | "flicker" | "flickers" => "blink",
        "board_wipe" | "board_wipes" | "mass_removal" | "mass_removals" => "board_wipe",
        "burn" => "burn",
        "card_advantage" | "card_advantages" | "card_draw" | "card_draws" | "draw" => {
            "card_advantage"
        }
        "combo" => "combo",
        "copy" | "copies" => "copy",
        "counter" | "counters" => "counters",
        "counterspell" | "counterspells" => "counterspell",
        "creature" | "creatures" => "creature",
        "discard" => "discard",
        "drain" => "drain",
        "engine" | "synergy" => "engine",
        "enchantment" | "enchantments" => "enchantment",
        "equipment" => "equipment",
        "evasion" | "flying" => "evasion",
        "finisher" | "finishers" | "win_condition" | "win_conditions" => "win_condition",
        "fog" | "fogs" | "pseudo_fog" => "fog",
        "graveyard_hate" => "graveyard_hate",
        "instant" | "instants" => "instant",
        "land" | "lands" => "land",
        "land_ramp" | "mana_ramp" | "ramp" => "ramp",
        "life_gain" | "lifegain" => "lifegain",
        "mill" => "mill",
        "planeswalker" | "planeswalkers" => "planeswalker",
        "pillow_fort" | "pillowfort" | "tax_attack" => "pillowfort",
        "protection" => "protection",
        "pump" => "pump",
        "recursion" => "recursion",
        "removal" | "spot_removal" => "removal",
        "sacrifice" => "sacrifice",
        "spellslinger" => "spellslinger",
        "stax" => "stax",
        "storm" => "storm",
        "sunforger" => "sunforger",
        "sorcery" | "sorceries" => "sorcery",
        "theft" => "theft",
        "token" | "tokens" => "tokens",
        "tutor" | "tutors" => "tutor",
        "voltron" => "voltron",
        _ => return None,
    })
}

const MASS_DISRUPTION_THEMES: [&str; 5] =
    ["board_wipe", "fog", "graveyard_hate", "pillowfort", "stax"];
const TARGETED_DISRUPTION_THEMES: [&str; 4] = ["counterspell", "discard", "removal", "theft"];
const PROTECTIVE_DISRUPTION_THEMES: [&str; 1] = ["protection"];
const SPELL_TYPE_THEMES: [&str; 2] = ["instant", "sorcery"];
const HAND_NEUTRAL_TAGS: [&str; 1] = ["hand_neutral"];
const HAND_POSITIVE_TAGS: [&str; 1] = ["hand_positive"];

/// Categories scored by how many of a card's tags carry their themes, in
/// tie-breaking priority order.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ScoredCategory {
    CardAdvantage,
    Ramp,
    TargetedDisruption,
}

const SCORED_CATEGORIES: [ScoredCategory; 3] = [
    ScoredCategory::CardAdvantage,
    ScoredCategory::Ramp,
    ScoredCategory::TargetedDisruption,
];

impl ScoredCategory {
    fn name(self) -> &'static str {
        match self {
            Self::CardAdvantage => "card_advantage",
            Self::Ramp => "ramp",
            Self::TargetedDisruption => "targeted_disruption",
        }
    }

    /// Themes counted for the category. Protection counts as targeted
    /// disruption only on instants and sorceries.
    fn themes(self, type_themes: &[&'static str]) -> Vec<&'static str> {
        match self {
            Self::CardAdvantage => vec!["card_advantage"],
            Self::Ramp => vec!["ramp"],
            Self::TargetedDisruption => {
                let mut themes = TARGETED_DISRUPTION_THEMES.to_vec();
                if type_themes
                    .iter()
                    .any(|theme| SPELL_TYPE_THEMES.contains(theme))
                {
                    themes.extend(PROTECTIVE_DISRUPTION_THEMES);
                }
                themes
            }
        }
    }
}

/// Themes listed first for a card in each category.
fn category_theme_order(category: &str) -> &'static [&'static str] {
    match category {
        "lands" => &["land"],
        "mass_disruption" => &["board_wipe", "fog", "graveyard_hate", "pillowfort", "stax"],
        "ramp" => &["ramp"],
        "card_advantage" => &["card_advantage"],
        "targeted_disruption" => &["removal", "counterspell", "protection", "discard", "theft"],
        _ => &[],
    }
}

/// A tag as stored in `scryfall_cards.oracle_tags`. Field order is the key
/// order Jason wrote for the Elixir atom-keyed map.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StoredTag {
    pub annotation: Value,
    pub id: Value,
    pub label: Value,
    pub slug: Value,
    pub weight: Value,
}

/// One selected tag on one card, with the themes the tag implies.
#[derive(Debug, Clone, PartialEq)]
pub struct TagEntry {
    pub themes: Vec<&'static str>,
    pub tag: StoredTag,
}

/// Selected tags by oracle id, deduplicated and sorted by slug then id.
pub type OracleTagIndex = HashMap<String, Vec<TagEntry>>;

/// The oracle tag columns of a card row.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TagFields {
    /// JSON array of [`StoredTag`]s.
    pub oracle_tags: String,
    /// Always set: `"other"` when nothing else applies.
    pub deck_category: Option<String>,
    /// JSON array of theme names.
    pub deck_themes: String,
}

fn field<'a>(map: &'a Value, key: &str) -> Option<&'a Value> {
    map.get(key).filter(|value| !value.is_null())
}

fn field_str<'a>(map: &'a Value, key: &str) -> Option<&'a str> {
    field(map, key).and_then(Value::as_str)
}

/// `List.wrap/1`: `nil` is empty, a list is itself, anything else is one item.
fn wrap(value: Option<&Value>) -> Vec<&Value> {
    match value {
        None | Some(Value::Null) => Vec::new(),
        Some(Value::Array(items)) => items.iter().collect(),
        Some(other) => vec![other],
    }
}

/// Lowercases and turns every run of characters other than `a-z0-9` into a
/// single `_`, trimming `_` from both ends. Non-strings normalize to `""`.
fn normalize_theme_name(value: Option<&Value>) -> String {
    let Some(text) = value.and_then(Value::as_str) else {
        return String::new();
    };
    let mut out = String::with_capacity(text.len());
    let mut pending = false;
    for c in text.to_lowercase().chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            if pending {
                out.push('_');
            }
            pending = false;
            out.push(c);
        } else {
            pending = true;
        }
    }
    // Leading separators are dropped by the trim; a trailing one never lands.
    out.trim_matches('_').to_owned()
}

fn names(tag: &Value) -> Vec<String> {
    let mut names = vec![
        normalize_theme_name(field(tag, "slug")),
        normalize_theme_name(field(tag, "label")),
    ];
    names.extend(
        wrap(field(tag, "aliases"))
            .into_iter()
            .map(|alias| normalize_theme_name(Some(alias))),
    );
    names
}

struct Tags<'a> {
    by_id: HashMap<&'a str, &'a Value>,
}

impl<'a> Tags<'a> {
    fn new(tags: &'a [Value]) -> Self {
        let by_id = tags
            .iter()
            .filter_map(|tag| field_str(tag, "id").map(|id| (id, tag)))
            .collect();
        Self { by_id }
    }

    fn parents(&self, tag: &Value) -> Vec<&'a Value> {
        wrap(field(tag, "parent_ids"))
            .into_iter()
            .filter_map(|id| id.as_str().and_then(|id| self.by_id.get(id).copied()))
            .collect()
    }

    /// Themes from the tag's own names and, recursively, its parents'.
    fn themes_from(&self, tag: &Value, visited: &HashSet<String>) -> Vec<&'static str> {
        let id = field_str(tag, "id");
        if id.is_some_and(|id| visited.contains(id)) {
            return Vec::new();
        }
        let mut visited = visited.clone();
        if let Some(id) = id {
            visited.insert(id.to_owned());
        }
        let mut themes: Vec<&'static str> = names(tag)
            .iter()
            .filter_map(|name| theme_alias(name))
            .collect();
        for parent in self.parents(tag) {
            themes.extend(self.themes_from(parent, &visited));
        }
        themes
    }

    fn has_marker(&self, tag: &Value, markers: &[&str], visited: &HashSet<String>) -> bool {
        if !tag.is_object() {
            return false;
        }
        let id = field_str(tag, "id");
        if id.is_some_and(|id| visited.contains(id)) {
            return false;
        }
        let mut visited = visited.clone();
        if let Some(id) = id {
            visited.insert(id.to_owned());
        }
        names(tag)
            .iter()
            .any(|name| markers.contains(&name.as_str()))
            || self
                .parents(tag)
                .into_iter()
                .any(|parent| self.has_marker(parent, markers, &visited))
    }

    /// The tag's themes. Card draw that keeps the hand size even (cycling,
    /// looting) is not card advantage unless also marked hand-positive.
    fn themes(&self, tag: &Value) -> Vec<&'static str> {
        let mut themes = self.themes_from(tag, &HashSet::new());
        if themes.contains(&"card_advantage")
            && self.has_marker(tag, &HAND_NEUTRAL_TAGS, &HashSet::new())
            && !self.has_marker(tag, &HAND_POSITIVE_TAGS, &HashSet::new())
        {
            themes.retain(|theme| *theme != "card_advantage");
        }
        unique(themes)
    }
}

fn unique<T: PartialEq + Copy>(values: impl IntoIterator<Item = T>) -> Vec<T> {
    let mut out = Vec::new();
    for value in values {
        if !out.contains(&value) {
            out.push(value);
        }
    }
    out
}

fn is_oracle_tag(tag: &Value) -> bool {
    matches!(
        normalize_theme_name(field(tag, "type")).as_str(),
        "oracle" | "function" | "functional"
    )
}

/// Taggings of a whole card (not of one illustration).
fn oracle_tagging(tagging: &Value) -> Option<&str> {
    if !tagging.is_object() || field(tagging, "illustration_id").is_some() {
        return None;
    }
    field_str(tagging, "oracle_id")
}

fn value_or_null(map: &Value, key: &str) -> Value {
    field(map, key).cloned().unwrap_or(Value::Null)
}

fn sort_key(value: &Value) -> String {
    value.as_str().unwrap_or_default().to_owned()
}

/// Indexes the oracle tags bulk file by oracle id. Only oracle/functional
/// tags that imply at least one theme are kept.
#[must_use]
pub fn build_index(tags: &[Value]) -> OracleTagIndex {
    let lookup = Tags::new(tags);
    let mut index: OracleTagIndex = HashMap::new();
    for tag in tags.iter().filter(|tag| tag.is_object()) {
        let themes = lookup.themes(tag);
        if !is_oracle_tag(tag) || themes.is_empty() {
            continue;
        }
        for tagging in wrap(field(tag, "taggings")) {
            let Some(oracle_id) = oracle_tagging(tagging) else {
                continue;
            };
            index
                .entry(oracle_id.to_owned())
                .or_default()
                .push(TagEntry {
                    themes: themes.clone(),
                    tag: StoredTag {
                        id: value_or_null(tag, "id"),
                        slug: value_or_null(tag, "slug"),
                        label: value_or_null(tag, "label"),
                        weight: value_or_null(tagging, "weight"),
                        annotation: value_or_null(tagging, "annotation"),
                    },
                });
        }
    }
    for entries in index.values_mut() {
        let mut seen: Vec<Value> = Vec::new();
        entries.retain(|entry| {
            if seen.contains(&entry.tag.id) {
                false
            } else {
                seen.push(entry.tag.id.clone());
                true
            }
        });
        entries.sort_by_key(|entry| (sort_key(&entry.tag.slug), sort_key(&entry.tag.id)));
    }
    index
}

fn type_themes(type_line: Option<&str>) -> Vec<&'static str> {
    let Some(type_line) = type_line else {
        return Vec::new();
    };
    let normalized = normalize_theme_name(Some(&Value::String(type_line.to_owned())));
    let words: Vec<&str> = normalized.split('_').filter(|w| !w.is_empty()).collect();
    TYPE_THEMES
        .iter()
        .filter(|(word, _)| words.contains(word))
        .map(|(_, theme)| *theme)
        .collect()
}

fn category_count(entries: &[TagEntry], themes: &[&str]) -> usize {
    entries
        .iter()
        .filter(|entry| entry.themes.iter().any(|theme| themes.contains(theme)))
        .count()
}

fn deck_category(type_themes: &[&'static str], entries: &[TagEntry]) -> &'static str {
    if category_count(entries, &MASS_DISRUPTION_THEMES) > 0 {
        return "mass_disruption";
    }
    let mut best: Option<(ScoredCategory, usize)> = None;
    for category in SCORED_CATEGORIES {
        let count = category_count(entries, &category.themes(type_themes));
        if count > best.map_or(0, |(_, best_count)| best_count) {
            best = Some((category, count));
        }
    }
    match best {
        Some((category, _)) => category.name(),
        None if type_themes.contains(&"land") => "lands",
        None => "other",
    }
}

fn prioritize(themes: Vec<&'static str>, category: &str) -> Vec<&'static str> {
    let preferred: Vec<&'static str> = category_theme_order(category)
        .iter()
        .copied()
        .filter(|theme| themes.contains(theme))
        .collect();
    let rest = themes
        .into_iter()
        .filter(|theme| !preferred.contains(theme));
    preferred.iter().copied().chain(rest).collect()
}

fn to_json<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "[]".to_owned())
}

/// The oracle tag columns for a card with `oracle_id` and `type_line`.
#[must_use]
pub fn fields_for_card(
    oracle_id: Option<&str>,
    type_line: Option<&str>,
    index: &OracleTagIndex,
) -> TagFields {
    let entries: &[TagEntry] = oracle_id
        .and_then(|id| index.get(id))
        .map_or(&[], Vec::as_slice);
    let type_themes = type_themes(type_line);
    let category = deck_category(&type_themes, entries);
    let themes = unique(
        entries
            .iter()
            .flat_map(|entry| entry.themes.iter().copied())
            .chain(type_themes.iter().copied()),
    );
    let themes = prioritize(themes, category);
    let tags: Vec<&StoredTag> = entries.iter().map(|entry| &entry.tag).collect();
    TagFields {
        oracle_tags: to_json(&tags),
        deck_category: Some(category.to_owned()),
        deck_themes: to_json(&themes),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// `scryfall_tag/1` from the Elixir test support.
    pub fn scryfall_tag(attrs: Value) -> Value {
        let mut tag = json!({
            "object": "tag", "id": "tag-default", "slug": "default", "label": "Default",
            "type": "function", "description": null, "parent_ids": [], "child_ids": [],
            "aliases": [], "taggings": []
        });
        if let (Some(tag), Value::Object(attrs)) = (tag.as_object_mut(), attrs) {
            tag.extend(attrs);
        }
        tag
    }

    fn themes(fields: &TagFields) -> Vec<String> {
        serde_json::from_str(&fields.deck_themes).unwrap()
    }

    #[test]
    fn normalizes_theme_names() {
        let n = |s: &str| normalize_theme_name(Some(&json!(s)));
        assert_eq!(n("Spot Removal"), "spot_removal");
        assert_eq!(n("  board-wipe!! "), "board_wipe");
        assert_eq!(n("Basic Land — Plains"), "basic_land_plains");
        assert_eq!(normalize_theme_name(Some(&json!(3))), "");
    }

    #[test]
    fn stored_tags_keep_jason_key_order() {
        let index = build_index(&[scryfall_tag(json!({
            "id": "tag-ramp", "slug": "ramp", "label": "Ramp",
            "taggings": [{"oracle_id": "o", "weight": 0.93, "annotation": "fast"}]
        }))]);
        let fields = fields_for_card(Some("o"), Some("Artifact"), &index);
        assert_eq!(
            fields.oracle_tags,
            r#"[{"annotation":"fast","id":"tag-ramp","label":"Ramp","slug":"ramp","weight":0.93}]"#
        );
        assert_eq!(fields.deck_category.as_deref(), Some("ramp"));
        assert_eq!(themes(&fields), vec!["ramp", "artifact"]);
    }

    #[test]
    fn art_tags_and_illustration_taggings_are_ignored() {
        let index = build_index(&[
            scryfall_tag(json!({"id": "a", "slug": "ramp", "type": "artwork",
                "taggings": [{"oracle_id": "o"}]})),
            scryfall_tag(json!({"id": "b", "slug": "removal",
                "taggings": [{"oracle_id": "o", "illustration_id": "i"}]})),
            scryfall_tag(json!({"id": "c", "slug": "flower",
                "taggings": [{"oracle_id": "o"}]})),
        ]);
        assert!(index.is_empty());
    }

    #[test]
    fn parent_cycles_terminate() {
        let index = build_index(&[
            scryfall_tag(json!({"id": "a", "slug": "x", "parent_ids": ["b"],
                "taggings": [{"oracle_id": "o"}]})),
            scryfall_tag(json!({"id": "b", "slug": "ramp", "parent_ids": ["a"]})),
        ]);
        let fields = fields_for_card(Some("o"), None, &index);
        assert_eq!(fields.deck_category.as_deref(), Some("ramp"));
    }

    #[test]
    fn untagged_cards_get_type_themes() {
        let fields = fields_for_card(Some("o"), Some("Basic Land — Plains"), &HashMap::new());
        assert_eq!(fields.oracle_tags, "[]");
        assert_eq!(fields.deck_category.as_deref(), Some("lands"));
        assert_eq!(fields.deck_themes, r#"["land"]"#);
        let other = fields_for_card(Some("o"), Some("Legendary Creature — Cat"), &HashMap::new());
        assert_eq!(other.deck_category.as_deref(), Some("other"));
        assert_eq!(other.deck_themes, r#"["creature"]"#);
    }
}
