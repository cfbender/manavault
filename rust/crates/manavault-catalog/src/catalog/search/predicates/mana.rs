//! Mana cost (`m:`) and devotion (`devotion:`) predicates over
//! `c.mana_cost`, which stores symbols as Scryfall writes them (`{2}{W/U}`).

use crate::catalog::scryfall_query::Op;
use crate::catalog::sql::Fragment;

const COST: &str = "coalesce(c.mana_cost, '')";

/// The first half's cost of a split or adventure card (`{1}{G} // {R}`),
/// which is the cost devotion counts.
const FRONT_COST: &str =
    "substr(coalesce(c.mana_cost, ''), 1, instr(coalesce(c.mana_cost, '') || ' // ', ' // ') - 1)";

/// Two-color hybrid symbols in the order Scryfall writes them.
const HYBRID_PAIRS: [&str; 10] = [
    "W/U", "U/B", "B/R", "R/G", "G/W", "W/B", "U/R", "B/G", "R/W", "G/U",
];

/// A mana cost from a query: its generic amount (when it names one) and the
/// count of each other symbol.
#[derive(Debug, Default, PartialEq)]
pub struct Cost {
    generic: Option<i64>,
    symbols: Vec<(String, i64)>,
}

impl Cost {
    fn add(&mut self, symbol: &str) {
        if let Ok(amount) = symbol.parse::<i64>() {
            *self.generic.get_or_insert(0) += amount;
            return;
        }
        let symbol = canonical_symbol(symbol);
        match self.symbols.iter_mut().find(|(known, _)| *known == symbol) {
            Some((_, count)) => *count += 1,
            None => self.symbols.push((symbol, 1)),
        }
    }

    /// How many symbols the cost has, a generic amount counting as one.
    fn symbol_count(&self) -> i64 {
        self.symbols.iter().map(|(_, count)| count).sum::<i64>() + i64::from(self.generic.is_some())
    }
}

/// `{u/w}` and `{w/u}` are the same symbol, as are `{P/W}` and `{W/P}`.
fn canonical_symbol(symbol: &str) -> String {
    let symbol = symbol.to_uppercase();
    let (pair, phyrexian) = match symbol.strip_suffix("/P") {
        Some(pair) => (pair.to_owned(), true),
        None => match symbol.strip_prefix("P/") {
            Some(color) => (color.to_owned(), true),
            None => (symbol.clone(), false),
        },
    };
    let pair = match pair.split_once('/') {
        Some((a, b)) if HYBRID_PAIRS.contains(&format!("{b}/{a}").as_str()) => format!("{b}/{a}"),
        _ => pair,
    };
    if phyrexian { format!("{pair}/P") } else { pair }
}

/// Parses `{2}{W}{W}`, the shorthand `2WW`, or a mix. Split symbols need
/// braces. `None` when the value is not a mana cost.
#[must_use]
pub fn parse_cost(value: &str) -> Option<Cost> {
    let mut cost = Cost::default();
    let mut chars = value.trim().chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '{' => {
                let mut symbol = String::new();
                loop {
                    match chars.next() {
                        Some('}') => break,
                        Some(c) => symbol.push(c),
                        None => return None,
                    }
                }
                if symbol.is_empty() {
                    return None;
                }
                cost.add(&symbol);
            }
            digit if digit.is_ascii_digit() => {
                let mut number = String::from(digit);
                while let Some(next) = chars.next_if(char::is_ascii_digit) {
                    number.push(next);
                }
                cost.add(&number);
            }
            letter if "wubrgcxyzsWUBRGCXYZS".contains(letter) => cost.add(&letter.to_string()),
            _ => return None,
        }
    }
    (cost.generic.is_some() || !cost.symbols.is_empty()).then_some(cost)
}

/// How many times `needle` occurs in the stored mana cost.
fn occurrences(needle: &str) -> Fragment {
    occurrences_in(COST, needle)
}

fn occurrences_in(cost: &str, needle: &str) -> Fragment {
    Fragment::sql(format!("((length({cost}) - length(replace({cost}, "))
        .text(needle.to_owned())
        .push(", ''))) / length(")
        .text(needle.to_owned())
        .push("))")
}

fn symbol_count(symbol: &str) -> Fragment {
    occurrences(&format!("{{{symbol}}}"))
}

/// The card's generic amount: its leading numeric symbol, else 0.
fn card_generic() -> String {
    format!("(CASE WHEN {COST} GLOB '{{[0-9]*' THEN CAST(substr({COST}, 2) AS INTEGER) ELSE 0 END)")
}

fn card_symbol_total() -> String {
    format!("(length({COST}) - length(replace({COST}, '{{', '')))")
}

fn all(fragments: impl IntoIterator<Item = Fragment>) -> Fragment {
    fragments.into_iter().fold(Fragment::truth(), Fragment::and)
}

/// The card's cost has at least the query's symbols.
fn superset(cost: &Cost) -> Fragment {
    let symbols = cost
        .symbols
        .iter()
        .map(|(symbol, count)| symbol_count(symbol).push(" >= ").int(*count));
    let generic = cost
        .generic
        .filter(|amount| *amount > 0)
        .map(|amount| Fragment::sql(format!("{} >= ", card_generic())).int(amount));
    all(symbols.chain(generic))
}

/// The card's cost is exactly the query's.
fn equal(cost: &Cost) -> Fragment {
    let symbols = cost
        .symbols
        .iter()
        .map(|(symbol, count)| symbol_count(symbol).push(" = ").int(*count));
    all(symbols.chain([
        Fragment::sql(format!("{} = ", card_generic())).int(cost.generic.unwrap_or(0)),
        Fragment::sql(format!("{} = ", card_symbol_total())).int(cost.symbol_count()),
    ]))
}

/// The card's cost has only symbols the query has, and no more of each.
fn subset(cost: &Cost) -> Fragment {
    let covered = cost
        .symbols
        .iter()
        .fold(Fragment::sql("(0"), |acc, (symbol, count)| {
            acc.push(" + min(")
                .append(symbol_count(symbol))
                .push(", ")
                .int(*count)
                .push(")")
        })
        .push(")");
    let non_generic = format!(
        "({} - (CASE WHEN {COST} GLOB '{{[0-9]*' THEN 1 ELSE 0 END))",
        card_symbol_total()
    );
    covered
        .push(format!(" = {non_generic}"))
        .and(Fragment::sql(format!("{} <= ", card_generic())).int(cost.generic.unwrap_or(0)))
}

/// `m:`/`mana:` against a parsed cost: `:` and `>=` find costs with at least
/// these symbols, `=` exactly these, `<=` nothing beyond them.
#[must_use]
pub fn mana_cost(op: Op, cost: &Cost) -> Fragment {
    let condition = match op {
        Op::Colon | Op::Gte => superset(cost),
        Op::Eq => equal(cost),
        Op::Neq => return equal(cost).negate(),
        Op::Gt => superset(cost).and(equal(cost).negate()),
        Op::Lte => subset(cost),
        Op::Lt => subset(cost).and(equal(cost).negate()),
    };
    Fragment::sql(format!("{COST} != ''")).and(condition)
}

/// `devotion:`: how many of the card's mana symbols include any of the
/// query's colors, against how many symbols the query has. `:` means at
/// least.
#[must_use]
pub fn devotion(op: Op, cost: &Cost) -> Fragment {
    let mut colors: Vec<char> = Vec::new();
    let mut target = 0;
    for (symbol, count) in &cost.symbols {
        target += count;
        for color in symbol.chars().filter(|c| "WUBRG".contains(*c)) {
            if !colors.contains(&color) {
                colors.push(color);
            }
        }
    }
    if colors.is_empty() {
        return Fragment::falsity();
    }
    // Each color letter in a cost belongs to one symbol; a hybrid symbol of
    // two counted colors is subtracted once so it counts once.
    let mut total = Fragment::sql("(0");
    for color in &colors {
        total = total
            .push(" + ")
            .append(occurrences_in(FRONT_COST, &color.to_string()));
    }
    for (index, a) in colors.iter().enumerate() {
        for b in colors.iter().skip(index + 1) {
            for pair in [format!("{a}/{b}"), format!("{b}/{a}")] {
                total = total.push(" - ").append(occurrences_in(FRONT_COST, &pair));
            }
        }
    }
    let op = if op == Op::Colon { Op::Gte } else { op };
    super::permanent().and(total.push(format!(") {} ", op.sql())).int(target))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cost(generic: Option<i64>, symbols: &[(&str, i64)]) -> Cost {
        Cost {
            generic,
            symbols: symbols
                .iter()
                .map(|(symbol, count)| ((*symbol).to_owned(), *count))
                .collect(),
        }
    }

    #[test]
    fn parses_braced_and_shorthand_costs() {
        assert_eq!(parse_cost("2WW"), Some(cost(Some(2), &[("W", 2)])));
        assert_eq!(
            parse_cost("{10}{u/w}{P/b}g"),
            Some(cost(Some(10), &[("W/U", 1), ("B/P", 1), ("G", 1)]))
        );
        assert_eq!(
            parse_cost("{G}{U}"),
            Some(cost(None, &[("G", 1), ("U", 1)]))
        );
        assert_eq!(parse_cost("draw"), None);
        assert_eq!(parse_cost("{G"), None);
        assert_eq!(parse_cost(""), None);
    }
}
