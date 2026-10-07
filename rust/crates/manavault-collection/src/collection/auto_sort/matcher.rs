//! Matching items against auto-sort rules (`AutoSort.RuleMatcher`).

use crate::collection::auto_sort::rules::{SortRule, parse_date};
use crate::collection::item::CollectionItem;
use crate::pricing::PriceStore;

const COLORS: [&str; 5] = ["W", "U", "B", "R", "G"];

/// The first rule an item matches, by priority (`matching_rule/2`).
#[must_use]
pub fn matching_rule<'a>(
    rules: &'a [SortRule],
    item: &CollectionItem,
    prices: &PriceStore,
) -> Option<&'a SortRule> {
    rules.iter().find(|rule| matches(rule, item, prices))
}

fn matches(rule: &SortRule, item: &CollectionItem, prices: &PriceStore) -> bool {
    color_matches(rule, item)
        && type_matches(rule, item)
        && rarity_matches(rule, item)
        && price_matches(rule, item, prices)
        && set_matches(rule, item)
        && release_date_matches(rule, item)
}

/// Upper-cased WUBRG letters, in input order.
fn normalize_colors(colors: &[String]) -> Vec<String> {
    colors
        .iter()
        .map(|color| color.to_uppercase())
        .filter(|color| COLORS.contains(&color.as_str()))
        .collect()
}

/// The card's colors; a multi-face card with no front colors uses its color
/// identity, so transformed cards are not read as colorless.
fn item_colors(item: &CollectionItem) -> Vec<String> {
    let Some(card) = item.card() else {
        return Vec::new();
    };
    let colors = normalize_colors(&card.colors_list());
    if colors.is_empty() && card.name.contains(" // ") {
        normalize_colors(&card.color_identity_list())
    } else {
        colors
    }
}

fn color_matches(rule: &SortRule, item: &CollectionItem) -> bool {
    let item_colors = item_colors(item);
    let colors = normalize_colors(&rule.colors);
    match rule.color_mode.as_str() {
        "any" => true,
        "colorless" => item_colors.is_empty(),
        "multicolor" => item_colors.len() > 1,
        "include_any" => colors.is_empty() || colors.iter().any(|c| item_colors.contains(c)),
        "include_all" => colors.iter().all(|c| item_colors.contains(c)),
        "exact" => {
            colors.iter().all(|c| item_colors.contains(c))
                && item_colors.iter().all(|c| colors.contains(c))
        }
        _ => false,
    }
}

/// `Card.sorting_type_line/1`: a multi-face card sorts by its front face
/// when that face is a permanent.
#[must_use]
pub fn sorting_type_line(type_line: Option<&str>) -> String {
    let Some(type_line) = type_line else {
        return String::new();
    };
    let front = type_line.split("//").next().unwrap_or(type_line).trim();
    let permanent = front.split(|c: char| !c.is_alphanumeric()).any(|word| {
        [
            "artifact",
            "battle",
            "creature",
            "enchantment",
            "land",
            "planeswalker",
        ]
        .contains(&word.to_lowercase().as_str())
    });
    if permanent {
        front.to_owned()
    } else {
        type_line.to_owned()
    }
}

fn type_matches(rule: &SortRule, item: &CollectionItem) -> bool {
    let type_line =
        sorting_type_line(item.card().and_then(|card| card.type_line.as_deref())).to_lowercase();
    rule.type_line_includes
        .iter()
        .all(|word| type_line.contains(&word.to_lowercase()))
        && !rule
            .type_line_excludes
            .iter()
            .any(|word| type_line.contains(&word.to_lowercase()))
}

fn rarity_matches(rule: &SortRule, item: &CollectionItem) -> bool {
    if rule.rarities.is_empty() {
        return true;
    }
    let rarity = item
        .printing
        .record
        .rarity
        .as_deref()
        .unwrap_or("")
        .to_lowercase();
    rule.rarities.iter().any(|r| r.to_lowercase() == rarity)
}

fn price_matches(rule: &SortRule, item: &CollectionItem, prices: &PriceStore) -> bool {
    if rule.min_price_cents.is_none() && rule.max_price_cents.is_none() {
        return true;
    }
    match item.price_cents(prices) {
        Some(price) => {
            rule.min_price_cents.is_none_or(|min| price >= min)
                && rule.max_price_cents.is_none_or(|max| price <= max)
        }
        None => false,
    }
}

fn normalized_set_code(value: &str) -> String {
    value.trim().to_lowercase()
}

fn set_matches(rule: &SortRule, item: &CollectionItem) -> bool {
    if rule.set_codes.is_empty() {
        return true;
    }
    let codes: Vec<String> = rule
        .set_codes
        .iter()
        .map(|code| normalized_set_code(code))
        .filter(|code| !code.is_empty())
        .collect();
    let set_code = normalized_set_code(&item.printing.record.set_code);
    match rule.set_operator.as_str() {
        "in" => codes.contains(&set_code),
        "not_in" => !codes.contains(&set_code),
        _ => false,
    }
}

fn release_date_matches(rule: &SortRule, item: &CollectionItem) -> bool {
    let Some(threshold) = rule.release_date else {
        return true;
    };
    let released = item
        .printing
        .record
        .released_at
        .as_deref()
        .and_then(parse_date);
    match (rule.release_date_operator.as_str(), released) {
        ("before", Some(released)) => released < threshold,
        ("after", Some(released)) => released > threshold,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sorting_type_line_uses_permanent_front_faces() {
        assert_eq!(
            sorting_type_line(Some("Creature — Vampire Warlock // Sorcery")),
            "Creature — Vampire Warlock"
        );
        assert_eq!(
            sorting_type_line(Some("Sorcery // Instant")),
            "Sorcery // Instant"
        );
        assert_eq!(sorting_type_line(None), "");
    }
}
