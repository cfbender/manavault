//! Search predicates over cards aliased `c` and printings aliased `p`
//! (`Search.Cards.{Filter, TextPredicates, ColorPredicates, ScalarPredicates}`
//! and the shared `Search.ScalarPredicates`).
//!
//! Any query that joins `scryfall_cards AS c` and `scryfall_printings AS p`
//! can use these; the collection search reuses the shared ones.

use crate::catalog::scryfall_query::{self, Expr, Field, Op, Predicate};
use crate::catalog::search::name_match;
use crate::catalog::sql::Fragment;

/// `Values.downcase/1`: trimmed and lowercased.
#[must_use]
pub fn downcase(value: &str) -> String {
    value.trim().to_lowercase()
}

/// Parses a whole string as a float, like `Float.parse/1` with nothing left
/// over (`"3"`, `"-1.5"`, `"1e2"`; not `".5"` or `"inf"`).
#[must_use]
pub fn parse_float(value: &str) -> Option<f64> {
    let digits = value.strip_prefix(['+', '-']).unwrap_or(value);
    let (mantissa, exponent) = match digits.find(['e', 'E']) {
        Some(index) => (digits.get(..index)?, Some(digits.get(index + 1..)?)),
        None => (digits, None),
    };
    let (whole, fraction) = match mantissa.split_once('.') {
        Some((whole, fraction)) => (whole, Some(fraction)),
        None => (mantissa, None),
    };
    let all_digits = |text: &str| !text.is_empty() && text.bytes().all(|b| b.is_ascii_digit());
    if !all_digits(whole) || fraction.is_some_and(|f| !all_digits(f)) {
        return None;
    }
    if let Some(exponent) = exponent
        && !all_digits(exponent.strip_prefix(['+', '-']).unwrap_or(exponent))
    {
        return None;
    }
    value.parse().ok()
}

/// Parses a whole string as an integer, like `Integer.parse/1` with nothing
/// left over.
#[must_use]
pub fn parse_int(value: &str) -> Option<i64> {
    let digits = value.strip_prefix(['+', '-']).unwrap_or(value);
    if digits.is_empty() || !digits.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    value.parse().ok()
}

fn comparison(column: &str, op: Op) -> String {
    format!("{column} {} ", op.sql())
}

fn negate_if(condition: Fragment, op: Op) -> Fragment {
    if op == Op::Neq {
        condition.negate()
    } else {
        condition
    }
}

fn equality_op(op: Op) -> bool {
    matches!(op, Op::Colon | Op::Eq | Op::Neq)
}

// Text predicates.

/// A loose name term: the card name or a printing's flavor name.
#[must_use]
pub fn plain_text(term: &str) -> Fragment {
    let pattern = name_match::like_pattern(term);
    Fragment::sql("(c.normalized_name LIKE ")
        .text(pattern.clone())
        .push(" ESCAPE '\\' OR p.normalized_flavor_name LIKE ")
        .text(pattern)
        .push(" ESCAPE '\\')")
}

/// The text fields a keyed predicate can match.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextField {
    Name,
    Type,
    Oracle,
    Mana,
}

/// `TextPredicates.field/3`.
#[must_use]
pub fn text_field(field: TextField, op: Op, value: &str) -> Fragment {
    if value.is_empty() {
        return Fragment::truth();
    }
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let pattern = name_match::substring_pattern(&downcase(value));
    let column = match field {
        TextField::Name => return negate_if(plain_text(value), op),
        TextField::Type => "c.type_line",
        TextField::Oracle => "c.oracle_text",
        TextField::Mana => "c.mana_cost",
    };
    let condition = Fragment::sql(format!("lower(coalesce({column}, '')) LIKE "))
        .text(pattern)
        .push(" ESCAPE '\\'");
    negate_if(condition, op)
}

// Shared scalar predicates.

const RARITY_RANK_SQL: &str = "CASE lower(coalesce(p.rarity, '')) WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 WHEN 'special' THEN 5 WHEN 'bonus' THEN 6 ELSE 0 END";

fn rarity_rank(value: &str) -> Option<i64> {
    Some(match downcase(value).as_str() {
        "c" | "common" => 1,
        "u" | "uncommon" => 2,
        "r" | "rare" => 3,
        "m" | "mythic" => 4,
        "s" | "special" => 5,
        "b" | "bonus" => 6,
        _ => return None,
    })
}

/// `mv`/`cmc`: numbers, `even`, or `odd`.
#[must_use]
pub fn mana_value(op: Op, value: &str) -> Fragment {
    match downcase(value).as_str() {
        "even" => Fragment::sql("CAST(coalesce(c.cmc, 0) AS INTEGER) % 2 = 0"),
        "odd" => Fragment::sql("CAST(coalesce(c.cmc, 0) AS INTEGER) % 2 = 1"),
        value => match parse_float(value) {
            Some(number) => Fragment::sql(comparison("c.cmc", op)).real(number),
            None => Fragment::falsity(),
        },
    }
}

/// `r`/`rarity`, compared by rank.
#[must_use]
pub fn rarity(op: Op, value: &str) -> Fragment {
    match rarity_rank(value) {
        Some(rank) => Fragment::sql(format!("{RARITY_RANK_SQL} {} ", op.sql())).int(rank),
        None => Fragment::falsity(),
    }
}

/// `s`/`set`: the set code exactly or a substring of the set name.
#[must_use]
pub fn set(op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let value = downcase(value);
    let pattern = name_match::substring_pattern(&value);
    let condition = Fragment::sql("(lower(p.set_code) = ")
        .text(value)
        .push(" OR lower(coalesce(p.set_name, '')) LIKE ")
        .text(pattern)
        .push(" ESCAPE '\\')");
    negate_if(condition, op)
}

/// `cn`/`number`: exact text, or a numeric comparison.
#[must_use]
pub fn collector_number(op: Op, value: &str) -> Fragment {
    if equality_op(op) {
        let condition = Fragment::sql("lower(p.collector_number) = ").text(downcase(value));
        return negate_if(condition, op);
    }
    match parse_int(value) {
        Some(number) => {
            Fragment::sql(comparison("CAST(p.collector_number AS INTEGER)", op)).int(number)
        }
        None => Fragment::falsity(),
    }
}

/// Parses an ISO 8601 calendar date (`Date.from_iso8601/1`).
fn iso_date(value: &str) -> Option<String> {
    let date = time::Date::parse(
        value,
        time::macros::format_description!("[year]-[month]-[day]"),
    )
    .ok()?;
    let (year, month, day) = (date.year(), u8::from(date.month()), date.day());
    let text = format!("{year:04}-{month:02}-{day:02}");
    (text == value).then_some(text)
}

/// `date`/`released`: release date comparisons.
#[must_use]
pub fn date(op: Op, value: &str) -> Fragment {
    match iso_date(value) {
        Some(date) => Fragment::sql(comparison("p.released_at", op)).text(date),
        None => Fragment::falsity(),
    }
}

/// `year`: release year comparisons.
#[must_use]
pub fn year(op: Op, value: &str) -> Fragment {
    match parse_int(value) {
        Some(year) => Fragment::sql(comparison(
            "CAST(strftime('%Y', p.released_at) AS INTEGER)",
            op,
        ))
        .int(year),
        None => Fragment::falsity(),
    }
}

// Card-search scalar predicates.

/// `lang`: printing language.
#[must_use]
pub fn language(op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    negate_if(Fragment::sql("lower(p.lang) = ").text(downcase(value)), op)
}

/// `usd`: the printing's current price in the default finish order.
#[must_use]
pub fn price(op: Op, value: &str) -> Fragment {
    match parse_float(value) {
        Some(number) => {
            let sql = crate::catalog::price::price_sql("p");
            Fragment::sql(format!("{sql} {} ", op.sql())).real(number)
        }
        None => Fragment::falsity(),
    }
}

/// A card counts as allocated when any collection copy of it is allocated
/// to a deck.
fn allocated_to_deck() -> Fragment {
    Fragment::sql(
        "c.oracle_id IN (SELECT allocated_printing.oracle_id FROM deck_allocations AS allocation \
         JOIN collection_items AS allocated_item ON allocated_item.id = allocation.collection_item_id \
         JOIN scryfall_printings AS allocated_printing ON allocated_printing.scryfall_id = allocated_item.scryfall_id)",
    )
}

fn has_finish(finish: &str) -> Fragment {
    Fragment::sql(format!(
        "instr(coalesce(p.finishes, '[]'), '\"{finish}\"') > 0"
    ))
}

/// `is:`/`not:` flags.
#[must_use]
pub fn is_predicate(op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let condition = match downcase(value).as_str() {
        finish @ ("foil" | "nonfoil" | "etched") => has_finish(finish),
        "allocated" => allocated_to_deck(),
        "unallocated" => allocated_to_deck().negate(),
        "colorless" => color_count(ColorField::Colors, Op::Eq, 0, Op::Eq),
        "multicolor" => color_count(ColorField::Colors, Op::Gte, 2, Op::Gte),
        word @ ("land" | "creature" | "artifact" | "enchantment" | "planeswalker" | "instant"
        | "sorcery") => text_field(TextField::Type, Op::Colon, word),
        _ => Fragment::falsity(),
    };
    negate_if(condition, op)
}

// Color predicates.

/// The color columns a predicate can match.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColorField {
    Colors,
    Identity,
}

impl ColorField {
    fn column(self) -> &'static str {
        match self {
            Self::Colors => "c.colors",
            Self::Identity => "c.color_identity",
        }
    }
}

/// Color letters in a value: a color word, or `w`/`u`/`b`/`r`/`g` letters.
#[must_use]
pub fn parse_color_set(value: &str) -> Option<Vec<char>> {
    let letters: String = value.chars().filter(char::is_ascii_lowercase).collect();
    let colors: Vec<char> = match letters.as_str() {
        "white" => vec!['W'],
        "blue" => vec!['U'],
        "black" => vec!['B'],
        "red" => vec!['R'],
        "green" => vec!['G'],
        other => other
            .chars()
            .filter_map(|c| match c {
                'w' => Some('W'),
                'u' => Some('U'),
                'b' => Some('B'),
                'r' => Some('R'),
                'g' => Some('G'),
                _ => None,
            })
            .collect(),
    };
    let mut unique = Vec::new();
    for color in colors {
        if !unique.contains(&color) {
            unique.push(color);
        }
    }
    (!unique.is_empty()).then_some(unique)
}

/// `ColorPredicates.count/4`: compares how many colors a card has.
#[must_use]
pub fn color_count(field: ColorField, op: Op, count: i64, default_op: Op) -> Fragment {
    let op = if op == Op::Colon { default_op } else { op };
    Fragment::sql(format!(
        "(SELECT count(1) FROM json_each(COALESCE({}, '[]'))) {} ",
        field.column(),
        op.sql()
    ))
    .int(count)
}

fn color_presence(field: ColorField, color: char, present: bool) -> Fragment {
    Fragment::sql(format!("instr(coalesce({}, '[]'), ", field.column()))
        .text(format!("\"{color}\""))
        .push(if present { ") > 0" } else { ") = 0" })
}

fn color_set(field: ColorField, op: Op, colors: &[char]) -> Fragment {
    let op = op.comparison();
    let contains = colors.iter().fold(Fragment::truth(), |acc, color| {
        acc.and(color_presence(field, *color, true))
    });
    let excludes = ['W', 'U', 'B', 'R', 'G']
        .into_iter()
        .filter(|color| !colors.contains(color))
        .fold(Fragment::truth(), |acc, color| {
            acc.and(color_presence(field, color, false))
        });
    let count = i64::try_from(colors.len()).unwrap_or(i64::MAX);
    match op {
        Op::Colon | Op::Eq => contains.and(excludes),
        Op::Neq => contains.and(excludes).negate(),
        Op::Gte => contains,
        Op::Lte => excludes,
        Op::Gt => contains.and(color_count(field, Op::Gt, count, Op::Gt)),
        Op::Lt => excludes.and(color_count(field, Op::Lt, count, Op::Lt)),
    }
}

/// `c`/`color` and `id`/`identity` (`ColorPredicates.build/3`).
#[must_use]
pub fn colors(field: ColorField, op: Op, value: &str) -> Fragment {
    let value = downcase(value);
    match value.as_str() {
        "m" | "multicolor" => color_count(field, op, 2, Op::Gte),
        "c" | "colorless" => color_count(field, op, 0, Op::Eq),
        digits if !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()) => {
            match digits.parse() {
                Ok(count) => color_count(field, op, count, Op::Eq),
                Err(_) => Fragment::falsity(),
            }
        }
        other => match parse_color_set(other) {
            Some(colors) => color_set(field, op, &colors),
            None => Fragment::falsity(),
        },
    }
}

// The card-search filter.

fn for_expr(expr: &Expr) -> Fragment {
    match expr {
        Expr::And(terms) => terms
            .iter()
            .fold(Fragment::truth(), |acc, term| acc.and(for_expr(term))),
        Expr::Or(terms) => terms
            .iter()
            .fold(Fragment::falsity(), |acc, term| acc.or(for_expr(term))),
        Expr::Not(inner) => for_expr(inner).negate(),
        Expr::ExactName(name) => {
            let name = name_match::sql_normalize(name);
            Fragment::sql("(c.normalized_name = ")
                .text(name.clone())
                .push(" OR p.normalized_flavor_name = ")
                .text(name)
                .push(")")
        }
        Expr::Predicate(predicate) => for_predicate(predicate),
    }
}

fn for_predicate(predicate: &Predicate) -> Fragment {
    let Predicate {
        field,
        op,
        value,
        regex,
    } = predicate;
    if *regex {
        return Fragment::falsity();
    }
    let op = *op;
    match field {
        Field::Text => plain_text(value),
        Field::Name => text_field(TextField::Name, op, value),
        Field::Type => text_field(TextField::Type, op, value),
        Field::Oracle => text_field(TextField::Oracle, op, value),
        Field::Mana => text_field(TextField::Mana, op, value),
        Field::ManaValue => mana_value(op, value),
        Field::Colors => colors(ColorField::Colors, op, value),
        Field::Identity => colors(ColorField::Identity, op, value),
        Field::Rarity => rarity(op, value),
        Field::Set => set(op, value),
        Field::CollectorNumber => collector_number(op, value),
        Field::Language => language(op, value),
        Field::Usd => price(op, value),
        Field::Date => date(op, value),
        Field::Year => year(op, value),
        Field::Is => is_predicate(op, value),
        _ => Fragment::falsity(),
    }
}

/// The card-search condition for a query term (`Search.Cards.Filter.apply/2`):
/// `None` for a blank term, the parsed query's predicates, or a loose name
/// match on the whole term when it does not parse.
#[must_use]
pub fn card_filter(term: &str) -> Option<Fragment> {
    let term = term.trim();
    match scryfall_query::parse(term) {
        Ok(Expr::And(terms)) if terms.is_empty() => None,
        Ok(expr) => Some(for_expr(&expr)),
        Err(_) => Some(plain_text(term)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_numbers_like_elixir() {
        assert_eq!(parse_float("3"), Some(3.0));
        assert_eq!(parse_float("-1.5"), Some(-1.5));
        assert_eq!(parse_float("1e2"), Some(100.0));
        assert_eq!(parse_float(".5"), None);
        assert_eq!(parse_float("inf"), None);
        assert_eq!(parse_float("1."), None);
        assert_eq!(parse_int("+5"), Some(5));
        assert_eq!(parse_int("5a"), None);
        assert_eq!(iso_date("2015-01-01").as_deref(), Some("2015-01-01"));
        assert_eq!(iso_date("2015-02-30"), None);
        assert_eq!(iso_date("2015-1-1"), None);
    }

    #[test]
    fn color_sets() {
        assert_eq!(parse_color_set("uw"), Some(vec!['U', 'W']));
        assert_eq!(parse_color_set("white"), Some(vec!['W']));
        assert_eq!(parse_color_set("wuw"), Some(vec!['W', 'U']));
        assert_eq!(parse_color_set("xyz"), None);
    }
}
