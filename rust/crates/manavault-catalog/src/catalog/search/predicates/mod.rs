//! Search predicates over cards aliased `c` and printings aliased `p`
//! (`Search.Cards.{Filter, TextPredicates, ColorPredicates, ScalarPredicates}`
//! and the shared `Search.ScalarPredicates`), covering the Scryfall search
//! syntax (<https://scryfall.com/docs/syntax>) as far as the local catalog
//! stores what it needs. Keywords the catalog has no data for (cubes, art
//! tags) match nothing; display keywords (`order:`, `unique:`, ...) match
//! everything.
//!
//! Any query that joins `scryfall_cards AS c` and `scryfall_printings AS p`
//! can use these; the collection search reuses them through [`filter`].

mod history;
mod is;
pub mod mana;

use crate::catalog::scryfall_query::{self, Expr, Field, Op, Predicate};
use crate::catalog::search::name_match;
use crate::catalog::sql::Fragment;

pub use history::SET_TYPES;
pub use is::{has_predicate, is_predicate};

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

pub fn negate_if(condition: Fragment, op: Op) -> Fragment {
    if op == Op::Neq {
        condition.negate()
    } else {
        condition
    }
}

pub fn equality_op(op: Op) -> bool {
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
    Flavor,
    Artist,
}

impl TextField {
    fn column(self) -> &'static str {
        match self {
            Self::Name => "c.name",
            Self::Type => "c.type_line",
            Self::Oracle => "c.oracle_text",
            Self::Mana => "c.mana_cost",
            Self::Flavor => "p.flavor_text",
            Self::Artist => "p.artist",
        }
    }
}

/// How Oracle text refers to the card itself besides its name.
const SELF_REFERENCES: [&str; 14] = [
    "this land",
    "this creature",
    "this artifact",
    "this enchantment",
    "this planeswalker",
    "this battle",
    "this permanent",
    "this spell",
    "this card",
    "this vehicle",
    "this equipment",
    "this aura",
    "this saga",
    "this token",
];

/// Lowercased Oracle text with the card's names and
/// "this land"-style self-references written as `~`, so
/// `o:"~ enters tapped"` finds every card that enters tapped.
fn oracle_with_tilde() -> String {
    // The full name, the front face's, then a legend's short name
    // ("Boseiju" for "Boseiju, Who Shelters All").
    let names = [
        "lower(c.name)",
        "lower(substr(c.name, 1, instr(c.name || ' // ', ' // ') - 1))",
        "lower(substr(c.name, 1, instr(c.name || ',', ',') - 1))",
    ];
    let phrases = SELF_REFERENCES.map(|phrase| format!("'{phrase}'"));
    names
        .iter()
        .map(|name| (*name).to_owned())
        .chain(phrases)
        .fold(
            "lower(coalesce(c.oracle_text, ''))".to_owned(),
            |text, needle| format!("replace({text}, {needle}, '~')"),
        )
}

/// A Scryfall regular expression in Rust `regex` syntax: case-insensitive,
/// `^`/`$` at line boundaries, braces that are not repetitions (`{T}`)
/// matched literally, and Scryfall's shorthands `\sm` (a mana symbol),
/// `\spt` (X/X), `\spp` (+X/+X), and `\smm` (-X/-X).
fn scryfall_regex(value: &str) -> String {
    const STAT: &str = r"[\dX*]+";
    let value = value
        .replace(r"\spp", &format!(r"\+{STAT}/\+{STAT}"))
        .replace(r"\smm", &format!(r"-{STAT}/-{STAT}"))
        .replace(r"\spt", &format!(r"[+-]?{STAT}/[+-]?{STAT}"))
        .replace(r"\sm", r"\{[^}]+\}");
    let mut pattern = String::from("(?im)");
    let mut chars = value.chars().peekable();
    while let Some(c) = chars.next() {
        match c {
            '\\' => {
                pattern.push(c);
                if let Some(next) = chars.next() {
                    pattern.push(next);
                }
            }
            '{' => {
                let rest: String = chars.clone().collect();
                let repetition = rest.split_once('}').is_some_and(|(inside, _)| {
                    !inside.is_empty()
                        && inside.split(',').count() <= 2
                        && inside.split(',').next().is_some_and(|min| {
                            !min.is_empty() && min.bytes().all(|b| b.is_ascii_digit())
                        })
                        && inside.bytes().all(|b| b.is_ascii_digit() || b == b',')
                });
                if repetition {
                    pattern.push('{');
                    for next in chars.by_ref() {
                        pattern.push(next);
                        if next == '}' {
                            break;
                        }
                    }
                } else {
                    pattern.push_str(r"\{");
                }
            }
            '}' => pattern.push_str(r"\}"),
            c => pattern.push(c),
        }
    }
    pattern
}

/// `TextPredicates.field/3`: a case-insensitive substring match.
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
        TextField::Oracle if value.contains('~') => oracle_with_tilde(),
        other => format!("coalesce({}, '')", other.column()),
    };
    let condition = Fragment::sql(format!("lower({column}) LIKE "))
        .text(pattern)
        .push(" ESCAPE '\\'");
    negate_if(condition, op)
}

/// A `/regex/` value: a case-insensitive regular expression (Rust `regex`
/// syntax, close to Scryfall's). An invalid expression matches nothing.
#[must_use]
pub fn text_regex(field: TextField, op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let pattern = scryfall_regex(value);
    if regex::Regex::new(&pattern).is_err() {
        return Fragment::falsity();
    }
    let column = match field {
        TextField::Oracle if value.contains('~') => oracle_with_tilde(),
        other => format!("coalesce({}, '')", other.column()),
    };
    negate_if(Fragment::sql(format!("{column} REGEXP ")).text(pattern), op)
}

/// `kw:`/`keyword:`: one of the card's keyword abilities, by full name.
#[must_use]
pub fn keyword(op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let condition = Fragment::sql(
        "EXISTS (SELECT 1 FROM json_each(coalesce(c.keywords, '[]')) AS k WHERE lower(k.value) = ",
    )
    .text(downcase(value))
    .push(")");
    negate_if(condition, op)
}

/// `m:`/`mana:`: mana symbols when the value is a mana cost, else a
/// substring of the stored cost.
#[must_use]
pub fn mana(op: Op, value: &str) -> Fragment {
    match mana::parse_cost(value) {
        Some(cost) => mana::mana_cost(op, &cost),
        None => text_field(TextField::Mana, op, value),
    }
}

/// `devotion:`.
#[must_use]
pub fn devotion(op: Op, value: &str) -> Fragment {
    match mana::parse_cost(value) {
        Some(cost) => mana::devotion(op, &cost),
        None => Fragment::falsity(),
    }
}

/// Permanent cards, by type.
#[must_use]
pub fn permanent() -> Fragment {
    [
        "artifact",
        "creature",
        "enchantment",
        "land",
        "planeswalker",
        "battle",
    ]
    .into_iter()
    .fold(Fragment::falsity(), |acc, word| {
        acc.or(text_field(TextField::Type, Op::Colon, word))
    })
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
pub(crate) fn iso_date(value: &str) -> Option<String> {
    let date = time::Date::parse(
        value,
        time::macros::format_description!("[year]-[month]-[day]"),
    )
    .ok()?;
    let (year, month, day) = (date.year(), u8::from(date.month()), date.day());
    let text = format!("{year:04}-{month:02}-{day:02}");
    (text == value).then_some(text)
}

/// `date`/`released`: release date comparisons against a `yyyy-mm-dd`
/// date, `now`/`today`, or a set code's release date.
#[must_use]
pub fn date(op: Op, value: &str) -> Fragment {
    match history::date_value(value) {
        Some(date) => Fragment::sql(comparison("p.released_at", op)).append(date),
        None => Fragment::falsity(),
    }
}

/// `year`: release year comparisons against a year, `now`, or a set code's
/// release year.
#[must_use]
pub fn year(op: Op, value: &str) -> Fragment {
    let column = comparison("CAST(strftime('%Y', p.released_at) AS INTEGER)", op);
    match parse_int(value) {
        Some(year) => Fragment::sql(column).int(year),
        None => match history::date_value(value) {
            Some(date) => Fragment::sql(format!("{column}CAST(strftime('%Y', "))
                .append(date)
                .push(") AS INTEGER)"),
            None => Fragment::falsity(),
        },
    }
}

// Card-search scalar predicates.

/// Scryfall language codes and the names `lang:` accepts for them.
const LANGUAGES: [(&str, &[&str]); 18] = [
    ("en", &["english"]),
    ("es", &["spanish"]),
    ("fr", &["french"]),
    ("de", &["german"]),
    ("it", &["italian"]),
    ("pt", &["portuguese"]),
    ("ja", &["japanese", "jp"]),
    ("ko", &["korean", "kr"]),
    ("ru", &["russian"]),
    (
        "zhs",
        &["chinese", "simplified chinese", "simplifiedchinese", "cs"],
    ),
    ("zht", &["traditional chinese", "traditionalchinese", "ct"]),
    ("he", &["hebrew"]),
    ("la", &["latin"]),
    ("grc", &["ancient greek", "ancientgreek", "greek"]),
    ("ar", &["arabic"]),
    ("sa", &["sanskrit"]),
    ("ph", &["phyrexian"]),
    ("qya", &["quenya"]),
];

/// The Scryfall language code a `lang:` value names.
#[must_use]
pub fn language_code(value: &str) -> Option<&'static str> {
    let value = downcase(value);
    LANGUAGES
        .iter()
        .find(|(code, names)| *code == value || names.contains(&value.as_str()))
        .map(|(code, _)| *code)
}

/// `lang`: printing language, by code or name; `lang:any` matches every
/// language.
#[must_use]
pub fn language(op: Op, value: &str) -> Fragment {
    language_of("p.lang", op, value)
}

/// `lang` over a language column.
#[must_use]
pub fn language_of(column: &str, op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    if downcase(value) == "any" {
        return Fragment::truth();
    }
    let code = language_code(value).map_or_else(|| downcase(value), str::to_owned);
    negate_if(Fragment::sql(format!("lower({column}) = ")).text(code), op)
}

/// The price SQL of a printing alias in a currency: `usd` in the default
/// finish order (vendor prices first), `eur` and `tix` from Scryfall.
#[must_use]
pub fn price_column(currency: &str, printing: &str) -> Option<String> {
    Some(match currency {
        "usd" => crate::catalog::price::price_sql(printing),
        "eur" => format!(
            "CAST(NULLIF(COALESCE({printing}.prices->>'eur', {printing}.prices->>'eur_foil', {printing}.prices->>'eur_etched'), '') AS REAL)"
        ),
        "tix" => format!("CAST(NULLIF({printing}.prices->>'tix', '') AS REAL)"),
        _ => return None,
    })
}

/// `usd`: the printing's current price in the default finish order.
#[must_use]
pub fn price(op: Op, value: &str) -> Fragment {
    price_in("usd", op, value)
}

/// `usd`, `eur`, or `tix` compared with a number.
#[must_use]
pub fn price_in(currency: &str, op: Op, value: &str) -> Fragment {
    match (parse_float(value), price_column(currency, "p")) {
        (Some(number), Some(sql)) => Fragment::sql(format!("{sql} {} ", op.sql())).real(number),
        _ => Fragment::falsity(),
    }
}

/// The stats `pow`, `tou`, `pt`, `loy`, and `mv` compare.
fn stat_sql(name: &str) -> Option<(&'static str, &'static str)> {
    Some(match name {
        "pow" | "power" => ("c.power IS NOT NULL", "CAST(c.power AS REAL)"),
        "tou" | "toughness" => ("c.toughness IS NOT NULL", "CAST(c.toughness AS REAL)"),
        "pt" | "powtou" => (
            "c.power IS NOT NULL AND c.toughness IS NOT NULL",
            "(CAST(c.power AS REAL) + CAST(c.toughness AS REAL))",
        ),
        "loy" | "loyalty" => ("c.loyalty IS NOT NULL", "CAST(c.loyalty AS REAL)"),
        "mv" | "cmc" | "manavalue" => ("c.cmc IS NOT NULL", "c.cmc"),
        _ => return None,
    })
}

/// `pow`, `tou`, `pt`, and `loy` compared with a number or another stat
/// (`pow>tou`). `pow:*` matches the printed value.
#[must_use]
pub fn stat(field: Field, op: Op, value: &str) -> Fragment {
    let name = match field {
        Field::Power => "pow",
        Field::Toughness => "tou",
        Field::PowTou => "pt",
        _ => "loy",
    };
    let Some((present, own)) = stat_sql(name) else {
        return Fragment::falsity();
    };
    let value = downcase(value);
    if let Some(number) = parse_float(&value) {
        return Fragment::sql(format!("({present} AND {own} {} ", op.sql()))
            .real(number)
            .push(")");
    }
    if let Some((other_present, other)) = stat_sql(&value) {
        return Fragment::sql(format!(
            "({present} AND {other_present} AND {own} {} {other})",
            op.sql()
        ));
    }
    let column = match field {
        Field::Power => "c.power",
        Field::Toughness => "c.toughness",
        Field::Loyalty => "c.loyalty",
        _ => return Fragment::falsity(),
    };
    if !equality_op(op) {
        return Fragment::falsity();
    }
    negate_if(Fragment::sql(format!("lower({column}) = ")).text(value), op)
}

/// `edhrec`/`edhrecrank`: EDHREC popularity rank (1 is the most popular).
#[must_use]
pub fn edhrec_rank(op: Op, value: &str) -> Fragment {
    match parse_int(value) {
        Some(rank) => Fragment::sql(format!(
            "(c.edhrec_rank IS NOT NULL AND c.edhrec_rank {} ",
            op.sql()
        ))
        .int(rank)
        .push(")"),
        None => Fragment::falsity(),
    }
}

/// Format names `f:` accepts besides the legality keys Scryfall uses.
fn format_key(value: &str) -> String {
    let value = downcase(value).replace(['_', '-', ' '], "");
    match value.as_str() {
        "edh" => "commander".to_owned(),
        "pennydreadful" => "penny".to_owned(),
        "duelcommander" => "duel".to_owned(),
        "pdh" => "paupercommander".to_owned(),
        "brawlstandard" => "standardbrawl".to_owned(),
        "old" | "oldschool9394" => "oldschool".to_owned(),
        _ => value,
    }
}

/// `f:`/`format:`/`legal:` (legal or restricted), `banned:`, and
/// `restricted:`.
#[must_use]
pub fn legality(field: Field, op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let statuses = match field {
        Field::Banned => "('banned')",
        Field::Restricted => "('restricted')",
        _ => "('legal', 'restricted')",
    };
    let condition = Fragment::sql("(c.legalities ->> ")
        .text(format_key(value))
        .push(format!(") IN {statuses}"));
    negate_if(condition, op)
}

/// A printing column compared case-insensitively with the value.
fn printing_equals(column: &str, op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    negate_if(
        Fragment::sql(format!("lower(coalesce({column}, '')) = ")).text(downcase(value)),
        op,
    )
}

/// `frame:`: a frame edition (`1993`, `1997`, `2003`, `2015`, `future`) or a
/// frame effect (`legendary`, `showcase`, `extendedart`, ...).
#[must_use]
pub fn frame(op: Op, value: &str) -> Fragment {
    let value = downcase(value);
    if matches!(value.as_str(), "1993" | "1997" | "2003" | "2015" | "future") {
        return printing_equals("p.frame", op, &value);
    }
    if !equality_op(op) {
        return Fragment::falsity();
    }
    negate_if(history::json_contains("p.frame_effects", &value), op)
}

/// `artists`: how many artists illustrated the printing.
#[must_use]
pub fn artist_count(op: Op, value: &str) -> Fragment {
    match parse_int(value) {
        Some(count) => Fragment::sql(format!(
            "(CASE WHEN coalesce(p.artist, '') = '' THEN 0 \
             ELSE 1 + (length(p.artist) - length(replace(p.artist, ' & ', ''))) / 3 END) {} ",
            op.sql()
        ))
        .int(count),
        None => Fragment::falsity(),
    }
}

/// `otag:`/`function:`: a Scryfall oracle tag the catalog keeps (the tags
/// that map to deck roles), by slug, or the deck theme it implies.
#[must_use]
pub fn oracle_tag(op: Op, value: &str) -> Fragment {
    if !equality_op(op) {
        return Fragment::falsity();
    }
    let slug = downcase(value).replace(['_', ' '], "-");
    let theme = slug.replace('-', "_");
    let condition = Fragment::sql(
        "(EXISTS (SELECT 1 FROM json_each(coalesce(c.oracle_tags, '[]')) AS t \
         WHERE lower(t.value ->> 'slug') = ",
    )
    .text(slug)
    .push(") OR ")
    .append(history::json_contains("c.deck_themes", &theme))
    .push(")");
    negate_if(condition, op)
}

// Color predicates.

/// The color columns a predicate can match.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ColorField {
    Colors,
    Identity,
    /// Mana the card can produce (`produces:`), which may include `C`.
    Produces,
}

impl ColorField {
    fn column(self) -> &'static str {
        match self {
            Self::Colors => "c.colors",
            Self::Identity => "c.color_identity",
            Self::Produces => "c.produced_mana",
        }
    }

    /// The colors a set of colors is complete over.
    fn universe(self) -> &'static [char] {
        match self {
            Self::Produces => &['W', 'U', 'B', 'R', 'G', 'C'],
            Self::Colors | Self::Identity => &['W', 'U', 'B', 'R', 'G'],
        }
    }
}

/// Scryfall's names for color combinations: guilds, shards, wedges,
/// Strixhaven colleges, and four-color nicknames.
const COLOR_NICKNAMES: [(&str, &str); 37] = [
    ("white", "w"),
    ("blue", "u"),
    ("black", "b"),
    ("red", "r"),
    ("green", "g"),
    ("azorius", "wu"),
    ("dimir", "ub"),
    ("rakdos", "br"),
    ("gruul", "rg"),
    ("selesnya", "gw"),
    ("orzhov", "wb"),
    ("izzet", "ur"),
    ("golgari", "bg"),
    ("boros", "rw"),
    ("simic", "gu"),
    ("bant", "gwu"),
    ("esper", "wub"),
    ("grixis", "ubr"),
    ("jund", "brg"),
    ("naya", "rgw"),
    ("abzan", "wbg"),
    ("jeskai", "urw"),
    ("sultai", "bgu"),
    ("mardu", "rwb"),
    ("temur", "gur"),
    ("silverquill", "wb"),
    ("prismari", "ur"),
    ("witherbloom", "bg"),
    ("lorehold", "rw"),
    ("quandrix", "gu"),
    ("chaos", "ubrg"),
    ("glint", "ubrg"),
    ("aggression", "wbrg"),
    ("dune", "wbrg"),
    ("altruism", "wurg"),
    ("growth", "wubg"),
    ("artifice", "wubr"),
];

/// Color letters in a value: a color word or nickname (`esper`, `azorius`,
/// `chaos`), or `w`/`u`/`b`/`r`/`g` letters. Any other letter makes the
/// value not a color set.
#[must_use]
pub fn parse_color_set(value: &str) -> Option<Vec<char>> {
    parse_colors(value, &['W', 'U', 'B', 'R', 'G'])
}

fn parse_colors(value: &str, universe: &[char]) -> Option<Vec<char>> {
    let letters: String = value
        .chars()
        .filter(char::is_ascii_alphabetic)
        .collect::<String>()
        .to_lowercase();
    let letters = COLOR_NICKNAMES
        .iter()
        .find(|(name, _)| *name == letters)
        .map_or(letters.as_str(), |(_, letters)| letters);
    let mut unique = Vec::new();
    for letter in letters.chars() {
        let color = letter.to_ascii_uppercase();
        if !universe.contains(&color) {
            return None;
        }
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
    let excludes = field
        .universe()
        .iter()
        .filter(|color| !colors.contains(color))
        .fold(Fragment::truth(), |acc, color| {
            acc.and(color_presence(field, *color, false))
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

/// `c`/`color`, `id`/`identity` (`ColorPredicates.build/3`), and
/// `produces`. As on Scryfall, `:` with colors means "at least these" for
/// colors and produced mana, and "fits within these" for identity (the
/// cards a commander of that identity can play); `=` means exactly.
#[must_use]
pub fn colors(field: ColorField, op: Op, value: &str) -> Fragment {
    let value = downcase(value);
    match value.as_str() {
        "m" | "multicolor" => color_count(field, op, 2, Op::Gte),
        "c" | "colorless" if field != ColorField::Produces => color_count(field, op, 0, Op::Eq),
        digits if !digits.is_empty() && digits.bytes().all(|b| b.is_ascii_digit()) => {
            match digits.parse() {
                Ok(count) => color_count(field, op, count, Op::Eq),
                Err(_) => Fragment::falsity(),
            }
        }
        other => match parse_colors(other, field.universe()) {
            Some(colors) if op == Op::Colon => {
                let op = if field == ColorField::Identity {
                    Op::Lte
                } else {
                    Op::Gte
                };
                color_set(field, op, &colors)
            }
            Some(colors) => color_set(field, op, &colors),
            None => Fragment::falsity(),
        },
    }
}

// The card-search filter.

/// The condition for a parsed query, with `leaf` building each predicate's
/// condition (the collection search overrides a few fields).
pub fn filter(expr: &Expr, leaf: &dyn Fn(&Predicate) -> Fragment) -> Fragment {
    match expr {
        Expr::And(terms) => terms
            .iter()
            .fold(Fragment::truth(), |acc, term| acc.and(filter(term, leaf))),
        Expr::Or(terms) => terms
            .iter()
            .fold(Fragment::falsity(), |acc, term| acc.or(filter(term, leaf))),
        Expr::Not(inner) => filter(inner, leaf).negate(),
        Expr::ExactName(name) => {
            let name = name_match::sql_normalize(name);
            Fragment::sql("(c.normalized_name = ")
                .text(name.clone())
                .push(" OR p.normalized_flavor_name = ")
                .text(name)
                .push(")")
        }
        Expr::Predicate(predicate) => leaf(predicate),
    }
}

/// The condition for one card-search predicate.
#[must_use]
pub fn predicate(predicate: &Predicate) -> Fragment {
    let Predicate {
        field,
        op,
        value,
        regex,
    } = predicate;
    let op = *op;
    if *regex {
        return match field {
            Field::Name => text_regex(TextField::Name, op, value),
            Field::Type => text_regex(TextField::Type, op, value),
            Field::Oracle => text_regex(TextField::Oracle, op, value),
            Field::Flavor => text_regex(TextField::Flavor, op, value),
            Field::Artist => text_regex(TextField::Artist, op, value),
            _ => Fragment::falsity(),
        };
    }
    match field {
        Field::Text => plain_text(value),
        Field::Name => text_field(TextField::Name, op, value),
        Field::Type => text_field(TextField::Type, op, value),
        Field::Oracle => text_field(TextField::Oracle, op, value),
        Field::Flavor => text_field(TextField::Flavor, op, value),
        Field::Artist => text_field(TextField::Artist, op, value),
        Field::Keyword => keyword(op, value),
        Field::Mana => mana(op, value),
        Field::Devotion => devotion(op, value),
        Field::ManaValue => mana_value(op, value),
        Field::Power | Field::Toughness | Field::PowTou | Field::Loyalty => stat(*field, op, value),
        Field::Colors => colors(ColorField::Colors, op, value),
        Field::Identity => colors(ColorField::Identity, op, value),
        Field::Produces => colors(ColorField::Produces, op, value),
        Field::Rarity => rarity(op, value),
        Field::Set => set(op, value),
        Field::SetType => printing_equals("p.set_type", op, value),
        Field::Block => history::block(op, value),
        Field::Group => history::group(op, value),
        Field::In => history::in_predicate(op, value),
        Field::New => history::new_predicate(op, value),
        Field::CollectorNumber => collector_number(op, value),
        Field::Language => language(op, value),
        Field::Usd => price_in("usd", op, value),
        Field::Eur => price_in("eur", op, value),
        Field::Tix => price_in("tix", op, value),
        Field::Cheapest => history::cheapest(op, value),
        Field::Date => date(op, value),
        Field::Year => year(op, value),
        Field::Is => is_predicate(op, value),
        Field::Has => has_predicate(op, value),
        Field::Format | Field::Legal | Field::Banned | Field::Restricted => {
            legality(*field, op, value)
        }
        Field::EdhrecRank => edhrec_rank(op, value),
        Field::Artists => artist_count(op, value),
        Field::Illustrations => history::count(history::Count::Illustrations, op, value),
        Field::Prints => history::count(history::Count::Prints, op, value),
        Field::Sets => history::count(history::Count::Sets, op, value),
        Field::PaperPrints => history::count(history::Count::PaperPrints, op, value),
        Field::PaperSets => history::count(history::Count::PaperSets, op, value),
        Field::Watermark => printing_equals("p.watermark", op, value),
        Field::Border => printing_equals("p.border_color", op, value),
        Field::Frame => frame(op, value),
        Field::Stamp => printing_equals("p.security_stamp", op, value),
        Field::Game => {
            if equality_op(op) {
                negate_if(history::json_contains("p.games", &downcase(value)), op)
            } else {
                Fragment::falsity()
            }
        }
        Field::OracleTag => oracle_tag(op, value),
        // Display options shape results, not which cards match.
        Field::Include
        | Field::Unique
        | Field::Order
        | Field::Direction
        | Field::Display
        | Field::Prefer => Fragment::truth(),
        // No local data: art tags, cube lists, and collection-only fields.
        Field::ArtTag
        | Field::Cube
        | Field::Quantity
        | Field::Paid
        | Field::Added
        | Field::Unknown => Fragment::falsity(),
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
        Ok(expr) => Some(filter(&expr, &predicate)),
        Err(_) => Some(plain_text(term)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_numbers_like_earlier_releases() {
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
    fn translates_scryfall_regexes() {
        assert_eq!(scryfall_regex("^{T}:"), r"(?im)^\{T\}:");
        assert_eq!(scryfall_regex(r"x{2,3}\{"), r"(?im)x{2,3}\{");
        assert_eq!(scryfall_regex(r"\spp"), r"(?im)\+[\dX*]+/\+[\dX*]+");
        for value in ["^{T}:", r"\sm{1}", r"[ab]{2}", r"\spt \smm"] {
            assert!(regex::Regex::new(&scryfall_regex(value)).is_ok(), "{value}");
        }
    }

    #[test]
    fn color_sets() {
        assert_eq!(parse_color_set("uw"), Some(vec!['U', 'W']));
        assert_eq!(parse_color_set("white"), Some(vec!['W']));
        assert_eq!(parse_color_set("wuw"), Some(vec!['W', 'U']));
        assert_eq!(parse_color_set("xyz"), None);
        assert_eq!(parse_color_set("esper"), Some(vec!['W', 'U', 'B']));
        assert_eq!(parse_color_set("Azorius"), Some(vec!['W', 'U']));
        // Not a nickname, and not only color letters.
        assert_eq!(parse_color_set("bant!"), Some(vec!['G', 'W', 'U']));
        assert_eq!(parse_color_set("burg"), Some(vec!['B', 'U', 'R', 'G']));
        assert_eq!(parse_color_set("rakdoss"), None);
    }
}
