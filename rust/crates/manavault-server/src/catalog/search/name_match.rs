//! Card-name matching semantics shared by every name search
//! (`Manavault.Catalog.Search.NameMatch`).
//!
//! Matching is case-, diacritic-, and apostrophe-insensitive. SQL filters
//! compare against the stored `normalized_name` / `normalized_flavor_name`
//! columns (written with [`lotus::normalize_name`]); in-memory matching uses
//! [`lotus::match_key`].

/// Tokens with no discriminative weight of their own.
const STOPWORDS: [&str; 19] = [
    "of", "the", "a", "an", "and", "or", "to", "in", "on", "at", "for", "with", "from", "by", "de",
    "le", "la", "el", "di",
];

/// Full normalization for in-memory matching.
#[must_use]
pub fn normalize(value: &str) -> String {
    lotus::match_key(value)
}

/// SQL-compatible normalization (`sql_normalize/1`).
#[must_use]
pub fn sql_normalize(value: &str) -> String {
    lotus::normalize_name(value)
}

/// Escapes LIKE metacharacters and wraps as a substring pattern.
#[must_use]
pub fn substring_pattern(value: &str) -> String {
    let escaped = value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}

/// LIKE pattern for a card-name search term.
#[must_use]
pub fn like_pattern(term: &str) -> String {
    substring_pattern(&sql_normalize(term))
}

/// A name the suggestion index can match.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NameEntry {
    /// The matched name (a card name or a flavor name).
    pub name: String,
    /// The card name to suggest.
    pub result_name: String,
    /// 0 for canonical names, 1 for flavor-name aliases.
    pub source_priority: u8,
    pub normalized_name: String,
    pub compact_name: String,
    pub tokens: Vec<String>,
}

impl NameEntry {
    #[must_use]
    pub fn new(result_name: &str, matched_name: &str, source_priority: u8) -> Self {
        let normalized_name = normalize(matched_name);
        Self {
            name: matched_name.to_owned(),
            result_name: result_name.to_owned(),
            source_priority,
            compact_name: normalized_name.replace(' ', ""),
            tokens: normalized_name
                .split(' ')
                .filter(|token| !token.is_empty())
                .map(str::to_owned)
                .collect(),
            normalized_name,
        }
    }
}

fn char_len(value: &str) -> usize {
    value.chars().count()
}

fn first_char(value: &str) -> Option<char> {
    value.chars().next()
}

/// Whether an entry is a candidate for the normalized term.
#[must_use]
pub fn candidate(term: &str, entry: &NameEntry) -> bool {
    if term.is_empty() {
        return false;
    }
    if entry.normalized_name.contains(term) {
        return true;
    }
    if entry.compact_name.contains(&term.replace(' ', "")) {
        return true;
    }
    token_match(term, entry) || compact_fuzzy_match(term, &entry.compact_name)
}

/// Sort key for a candidate; lower is better.
#[must_use]
pub fn score(term: &str, entry: &NameEntry) -> (u8, usize, String) {
    let lower = entry.name.to_lowercase();
    if entry.normalized_name == term {
        (0, 0, lower)
    } else if entry.normalized_name.starts_with(term) {
        (1, entry.name.len(), lower)
    } else if entry.normalized_name.contains(term)
        || entry.compact_name.contains(&term.replace(' ', ""))
    {
        (2, entry.name.len(), lower)
    } else {
        (8, fuzzy_distance(term, entry), lower)
    }
}

fn significant_tokens<'a>(tokens: &[&'a str]) -> Vec<&'a str> {
    let significant: Vec<&str> = tokens
        .iter()
        .copied()
        .filter(|token| !STOPWORDS.contains(token))
        .collect();
    if significant.is_empty() {
        tokens.to_vec()
    } else {
        significant
    }
}

fn token_match(term: &str, entry: &NameEntry) -> bool {
    let term_tokens: Vec<&str> = term.split(' ').filter(|t| !t.is_empty()).collect();
    significant_tokens(&term_tokens).iter().all(|term_token| {
        let length = char_len(term_token);
        let threshold = if length >= 3 { (length / 2).max(2) } else { 0 };
        entry.tokens.iter().any(|name_token| {
            name_token.starts_with(term_token)
                || (first_char(name_token) == first_char(term_token)
                    && edit_distance(term_token, name_token) <= threshold)
        })
    })
}

fn compact_fuzzy_match(term: &str, compact_name: &str) -> bool {
    let compact_term = term.replace(' ', "");
    let length = char_len(&compact_term);
    length >= 4
        && first_char(&compact_term) == first_char(compact_name)
        && edit_distance(&compact_term, compact_name) <= 3.max(length.div_ceil(3))
}

fn fuzzy_distance(term: &str, entry: &NameEntry) -> usize {
    let term_tokens: Vec<&str> = term.split(' ').filter(|t| !t.is_empty()).collect();
    let name_tokens: Vec<&str> = entry
        .normalized_name
        .split(' ')
        .filter(|t| !t.is_empty())
        .collect();
    let mut candidates = vec![
        edit_distance(term, &entry.normalized_name),
        edit_distance(&term.replace(' ', ""), &entry.compact_name),
        token_ordered_distance(&term_tokens, &name_tokens),
        token_aligned_distance(&term_tokens, &name_tokens) + 1,
    ];
    candidates.extend(name_tokens.iter().map(|token| edit_distance(term, token)));
    candidates.into_iter().min().unwrap_or(0)
}

fn token_aligned_distance(term_tokens: &[&str], name_tokens: &[&str]) -> usize {
    term_tokens
        .iter()
        .map(|term_token| {
            name_tokens
                .iter()
                .map(|name_token| edit_distance(term_token, name_token))
                .min()
                .unwrap_or(0)
        })
        .sum()
}

fn token_ordered_distance(term_tokens: &[&str], name_tokens: &[&str]) -> usize {
    match (term_tokens.split_first(), name_tokens.split_first()) {
        (None, _) => name_tokens.iter().map(|t| char_len(t)).sum(),
        (_, None) => term_tokens.iter().map(|t| char_len(t)).sum(),
        (Some((term, term_rest)), Some((name, name_rest))) => {
            edit_distance(term, name) + token_ordered_distance(term_rest, name_rest)
        }
    }
}

/// Levenshtein distance over characters.
#[must_use]
pub fn edit_distance(left: &str, right: &str) -> usize {
    if left == right {
        return 0;
    }
    let right: Vec<char> = right.chars().collect();
    let mut previous: Vec<usize> = (0..=right.len()).collect();
    for (row, left_char) in left.chars().enumerate() {
        let mut current = Vec::with_capacity(right.len() + 1);
        current.push(row + 1);
        for (column, right_char) in right.iter().enumerate() {
            let cost = usize::from(left_char != *right_char);
            let above = previous.get(column + 1).copied().unwrap_or(usize::MAX - 1);
            let diagonal = previous.get(column).copied().unwrap_or(usize::MAX - 1);
            let left_value = current.last().copied().unwrap_or(usize::MAX - 1);
            current.push((left_value + 1).min(above + 1).min(diagonal + cost));
        }
        previous = current;
    }
    previous.last().copied().unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(name: &str) -> NameEntry {
        NameEntry::new(name, name, 0)
    }

    #[test]
    fn normalizes_names() {
        assert_eq!(normalize("Aurelia's Fury"), "aurelias fury");
        assert_eq!(normalize("Aurelia\u{2019}s Fury"), "aurelias fury");
        assert_eq!(normalize("  Mask,  of-Memory! "), "mask of memory");
        assert_eq!(normalize("Óin the Brave"), "oin the brave");
    }

    #[test]
    fn like_patterns_fold_and_escape() {
        assert_eq!(like_pattern("Urza's"), "%urzas%");
        assert_eq!(like_pattern("Óin"), "%oin%");
        assert_eq!(like_pattern("100% _\\"), "%100\\% \\_\\\\%");
    }

    #[test]
    fn candidates() {
        let mask = entry("Mask of Memory");
        assert!(candidate("mask of memory", &mask));
        assert!(candidate("mask of mem", &mask));
        assert!(candidate("of memory", &mask));
        assert!(!candidate("mask of memory", &entry("Agent of Masks")));
        assert!(!candidate("mask of memory", &entry("Aegis of the Meek")));
        assert!(candidate("mask memory", &mask));
        assert!(!candidate("memory of mask", &entry("Aetherize")));
        assert!(!candidate("of", &entry("Lightning Bolt")));
        assert!(candidate("of", &entry("Aegis of the Meek")));
        assert!(candidate("mask of memroy", &mask));
        assert!(candidate("serra angle", &entry("Serra Angel")));
        assert!(!candidate("mask of xyzzy", &mask));
        assert!(!candidate("bolt", &entry("Colt")));
        assert!(candidate("lightningbilt", &entry("Lightning Bolt")));
        assert!(!candidate("", &mask));
    }

    #[test]
    fn scores_rank_match_classes() {
        let exact = score("mask of memory", &entry("Mask of Memory"));
        let prefix = score("mask", &entry("Mask of Avacyn"));
        let substring = score("memory", &entry("Mask of Memory"));
        let fuzzy = score("memroy", &entry("Mask of Memory"));
        assert!(exact < prefix);
        assert!(prefix < substring);
        assert!(substring < fuzzy);
        assert!(score("mask", &entry("Mask")) < score("mask", &entry("Mask of Avacyn")));
    }

    #[test]
    fn edit_distances() {
        assert_eq!(edit_distance("kitten", "sitting"), 3);
        assert_eq!(edit_distance("", "abc"), 3);
        assert_eq!(edit_distance("abc", ""), 3);
        assert_eq!(edit_distance("same", "same"), 0);
    }
}
