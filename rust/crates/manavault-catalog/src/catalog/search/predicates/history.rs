//! Predicates that look across a card's other printings or across sets:
//! `in:`, `new:`, print and set counts, `cheapest:`, blocks, set groups,
//! and dates given as set codes.

use crate::catalog::scryfall_query::Op;
use crate::catalog::sql::Fragment;

use super::{downcase, equality_op, language_code, negate_if, parse_int, price_column};

/// Scryfall set types, for `st:` and `in:`.
pub const SET_TYPES: [&str; 23] = [
    "core",
    "expansion",
    "masters",
    "alchemy",
    "masterpiece",
    "arsenal",
    "from_the_vault",
    "spellbook",
    "premium_deck",
    "duel_deck",
    "draft_innovation",
    "treasure_chest",
    "commander",
    "planechase",
    "archenemy",
    "vanguard",
    "funny",
    "starter",
    "box",
    "promo",
    "token",
    "memorabilia",
    "minigame",
];

const GAMES: [&str; 3] = ["paper", "mtgo", "arena"];

const RARITIES: [&str; 6] = ["common", "uncommon", "rare", "mythic", "special", "bonus"];

/// Whether the JSON array column contains the string.
pub fn json_contains(column: &str, value: &str) -> Fragment {
    Fragment::sql(format!("instr(coalesce({column}, '[]'), "))
        .text(format!("\"{value}\""))
        .push(") > 0")
}

/// A printing of the card (aliased `ip`) matches.
fn any_printing(condition: Fragment) -> Fragment {
    Fragment::sql(
        "EXISTS (SELECT 1 FROM scryfall_printings AS ip WHERE ip.oracle_id = c.oracle_id AND ",
    )
    .append(condition)
    .push(")")
}

/// `in:`: a game, rarity, set type, language, or set code any printing of
/// the card has.
#[must_use]
pub fn in_predicate(op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let value = downcase(value);
    let condition = if GAMES.contains(&value.as_str()) {
        json_contains("ip.games", &value)
    } else if RARITIES.contains(&value.as_str()) {
        Fragment::sql("lower(ip.rarity) = ").text(value)
    } else if value == "booster" {
        Fragment::sql("ip.booster")
    } else if SET_TYPES.contains(&value.as_str()) {
        Fragment::sql("ip.set_type = ").text(value)
    } else if let Some(code) = language_code(&value) {
        Fragment::sql("ip.lang = ").text(code)
    } else {
        Fragment::sql("lower(ip.set_code) = ").text(value)
    };
    negate_if(any_printing(condition), op)
}

/// `new:`: the printing is the card's first with this rarity, art, artist,
/// flavor text, frame, or language.
#[must_use]
pub fn new_predicate(op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let column = match downcase(value).as_str() {
        "rarity" => "rarity",
        "art" | "illustration" => "illustration_id",
        "artist" => "artist",
        "flavor" | "flavortext" => "flavor_text",
        "frame" => "frame",
        "language" | "lang" => "lang",
        _ => return Fragment::falsity(),
    };
    let condition = Fragment::sql(format!(
        "(p.released_at IS NOT NULL AND coalesce(p.{column}, '') != '' AND NOT EXISTS (\
         SELECT 1 FROM scryfall_printings AS np WHERE np.oracle_id = p.oracle_id \
         AND np.released_at < p.released_at AND np.{column} = p.{column}))"
    ));
    negate_if(condition, op)
}

/// What [`count`] counts.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Count {
    Prints,
    Sets,
    PaperPrints,
    PaperSets,
    Illustrations,
}

/// `prints`, `sets`, `paperprints`, `papersets`, and `illustrations`
/// compared with a number.
#[must_use]
pub fn count(what: Count, op: Op, value: &str) -> Fragment {
    let Some(number) = parse_int(value) else {
        return Fragment::falsity();
    };
    let (expression, paper) = match what {
        Count::Prints => ("count(*)", false),
        Count::Sets => ("count(DISTINCT cp.set_code)", false),
        Count::PaperPrints => ("count(*)", true),
        Count::PaperSets => ("count(DISTINCT cp.set_code)", true),
        Count::Illustrations => ("count(DISTINCT cp.illustration_id)", false),
    };
    let paper = if paper {
        " AND instr(cp.games, '\"paper\"') > 0"
    } else {
        ""
    };
    Fragment::sql(format!(
        "(SELECT {expression} FROM scryfall_printings AS cp WHERE cp.oracle_id = c.oracle_id{paper}) {} ",
        op.sql()
    ))
    .int(number)
}

/// `cheapest:usd`, `cheapest:eur`, `cheapest:tix`: the card's cheapest
/// priced printing in that currency.
#[must_use]
pub fn cheapest(op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let currency = downcase(value);
    let (Some(own), Some(other)) = (price_column(&currency, "p"), price_column(&currency, "op"))
    else {
        return Fragment::falsity();
    };
    let condition = Fragment::sql(format!(
        "({own} > 0 AND {own} <= (SELECT min({other}) FROM scryfall_printings AS op \
         WHERE op.oracle_id = p.oracle_id AND {other} > 0))"
    ));
    negate_if(condition, op)
}

/// `b:`/`block:`: printings in the block of the given set or block code.
#[must_use]
pub fn block(op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let code = downcase(value);
    let condition = Fragment::sql(
        "lower(p.set_code) IN (SELECT s.code FROM scryfall_sets AS s WHERE s.block_code IS NOT NULL \
         AND s.block_code = coalesce((SELECT b.block_code FROM scryfall_sets AS b WHERE b.code = ",
    )
    .text(code.clone())
    .push("), ")
    .text(code)
    .push("))");
    negate_if(condition, op)
}

/// `g:`/`group:`: printings in the given set, its parent, its parent's other
/// children, and its own children.
#[must_use]
pub fn group(op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let code = downcase(value);
    let root =
        Fragment::sql("coalesce((SELECT x.parent_set_code FROM scryfall_sets AS x WHERE x.code = ")
            .text(code.clone())
            .push("), ")
            .text(code.clone())
            .push(")");
    let condition = Fragment::sql("(lower(p.set_code) = ")
        .text(code.clone())
        .push(" OR lower(p.set_code) IN (SELECT s.code FROM scryfall_sets AS s WHERE s.code = ")
        .append(root.clone())
        .push(" OR s.parent_set_code = ")
        .append(root)
        .push(" OR s.parent_set_code = ")
        .text(code)
        .push("))");
    negate_if(condition, op)
}

/// The release date a `date`/`year` value stands for: a `yyyy-mm-dd` date,
/// `now`/`today`, or a set code's release date.
#[must_use]
pub fn date_value(value: &str) -> Option<Fragment> {
    let value = downcase(value);
    if let Some(date) = super::iso_date(&value) {
        return Some(Fragment::sql("").text(date));
    }
    if value == "now" || value == "today" {
        return Some(Fragment::sql("date('now')"));
    }
    let valid_code =
        !value.is_empty() && value.len() <= 8 && value.bytes().all(|b| b.is_ascii_alphanumeric());
    valid_code.then(|| {
        Fragment::sql(
            "(SELECT min(sp.released_at) FROM scryfall_printings AS sp WHERE lower(sp.set_code) = ",
        )
        .text(value)
        .push(")")
    })
}
