//! Parser and canonical serializer for the Scryfall search syntax subset used
//! by card and collection filtering (`Manavault.Catalog.ScryfallQuery`).
//!
//! The AST keeps unsupported keyed predicates; query backends decide whether
//! to reject, ignore, or fail closed on fields the local data does not store.

use std::fmt::Write as _;

/// A comparison operator.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Op {
    Colon,
    Eq,
    Neq,
    Gt,
    Gte,
    Lt,
    Lte,
}

impl Op {
    fn as_str(self) -> &'static str {
        match self {
            Self::Neq => "!=",
            Self::Gte => ">=",
            Self::Lte => "<=",
            Self::Colon => ":",
            Self::Eq => "=",
            Self::Gt => ">",
            Self::Lt => "<",
        }
    }

    /// `Values.comparison_op/1`: `:` compares for equality.
    #[must_use]
    pub fn comparison(self) -> Self {
        match self {
            Self::Colon => Self::Eq,
            other => other,
        }
    }

    /// The SQL comparison operator of [`Self::comparison`].
    #[must_use]
    pub fn sql(self) -> &'static str {
        match self.comparison() {
            Self::Colon | Self::Eq => "=",
            Self::Neq => "!=",
            Self::Gt => ">",
            Self::Gte => ">=",
            Self::Lt => "<",
            Self::Lte => "<=",
        }
    }
}

/// Operators in matching order: two-character operators first.
const OPERATORS: [(&str, Op); 7] = [
    ("!=", Op::Neq),
    (">=", Op::Gte),
    ("<=", Op::Lte),
    (":", Op::Colon),
    ("=", Op::Eq),
    (">", Op::Gt),
    ("<", Op::Lt),
];

macro_rules! fields {
    ($($variant:ident => $name:literal),* $(,)?) => {
        /// A predicate field. Unknown field names become [`Field::Unknown`].
        #[derive(Debug, Clone, Copy, PartialEq, Eq)]
        pub enum Field {
            $($variant,)*
            Unknown,
        }

        impl Field {
            /// The field's internal name.
            #[must_use]
            pub fn name(self) -> &'static str {
                match self {
                    $(Self::$variant => $name,)*
                    Self::Unknown => "unknown",
                }
            }

            fn from_name(name: &str) -> Option<Self> {
                match name {
                    $($name => Some(Self::$variant),)*
                    _ => None,
                }
            }
        }
    };
}

fields! {
    Text => "text",
    Name => "name",
    Type => "type",
    Oracle => "oracle",
    Keyword => "keyword",
    Mana => "mana",
    ManaValue => "mana_value",
    Colors => "colors",
    Identity => "identity",
    Rarity => "rarity",
    Set => "set",
    CollectorNumber => "collector_number",
    Language => "language",
    Is => "is",
    Usd => "usd",
    Eur => "eur",
    Tix => "tix",
    Quantity => "quantity",
    Date => "date",
    Year => "year",
    Paid => "paid",
    Added => "added",
    Artist => "artist",
    Flavor => "flavor",
    Game => "game",
    Format => "format",
    Legal => "legal",
    Banned => "banned",
    Restricted => "restricted",
    Unique => "unique",
    Order => "order",
    Direction => "direction",
}

impl Field {
    /// Field aliases (`@field_aliases`).
    fn alias(name: &str) -> Option<Self> {
        Some(match name {
            "n" | "name" => Self::Name,
            "t" | "type" => Self::Type,
            "o" | "oracle" | "fo" | "fulloracle" => Self::Oracle,
            "keyword" | "kw" => Self::Keyword,
            "m" | "mana" => Self::Mana,
            "mv" | "cmc" | "manavalue" => Self::ManaValue,
            "c" | "color" => Self::Colors,
            "id" | "identity" => Self::Identity,
            "r" | "rarity" => Self::Rarity,
            "s" | "e" | "set" | "edition" => Self::Set,
            "cn" | "number" => Self::CollectorNumber,
            "lang" | "language" => Self::Language,
            "is" => Self::Is,
            "usd" => Self::Usd,
            "eur" => Self::Eur,
            "tix" => Self::Tix,
            "qty" | "quantity" => Self::Quantity,
            "date" | "released" => Self::Date,
            "year" => Self::Year,
            "paid" => Self::Paid,
            "added" => Self::Added,
            "artist" => Self::Artist,
            "flavor" | "ft" => Self::Flavor,
            "game" => Self::Game,
            "format" => Self::Format,
            "legal" => Self::Legal,
            "banned" => Self::Banned,
            "restricted" => Self::Restricted,
            "unique" => Self::Unique,
            "order" => Self::Order,
            "direction" => Self::Direction,
            _ => return None,
        })
    }

    /// Normalizes a user-typed field name: aliases, then canonical names
    /// (the fields' internal names), else
    /// [`Field::Unknown`].
    fn normalize(raw: &str) -> Self {
        let normalized = raw.to_lowercase().replace('-', "_");
        Self::alias(&normalized)
            .or_else(|| Self::from_name(&normalized))
            .unwrap_or(Self::Unknown)
    }

    /// The canonical serialized name (`@canonical_fields`).
    fn canonical(self) -> Option<&'static str> {
        Some(match self {
            Self::Text => return None,
            Self::ManaValue => "mv",
            Self::Colors => "c",
            Self::Identity => "id",
            Self::CollectorNumber => "number",
            Self::Language => "lang",
            other => other.name(),
        })
    }
}

/// A keyed or loose search term.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Predicate {
    pub field: Field,
    pub op: Op,
    pub value: String,
    pub regex: bool,
}

/// A parsed query.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Expr {
    And(Vec<Expr>),
    Or(Vec<Expr>),
    Not(Box<Expr>),
    Predicate(Predicate),
    ExactName(String),
}

impl Expr {
    fn text(value: String) -> Self {
        Self::Predicate(Predicate {
            field: Field::Text,
            op: Op::Colon,
            value,
            regex: false,
        })
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum Token {
    Word(String),
    Or,
    Dash,
    LParen,
    RParen,
}

impl Token {
    /// The token as error messages have always shown it (`{:word, "x"}`,
    /// `:or`, ...).
    fn inspect(&self) -> String {
        match self {
            Self::Word(word) => format!("{{:word, {word:?}}}"),
            Self::Or => ":or".to_owned(),
            Self::Dash => ":dash".to_owned(),
            Self::LParen => ":lparen".to_owned(),
            Self::RParen => ":rparen".to_owned(),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Mode {
    Normal,
    Quote,
    Regex,
}

fn regex_prefix(buffer: &str) -> bool {
    let mut chars = buffer.chars();
    let Some(last) = buffer.chars().last() else {
        return false;
    };
    if last != ':' && last != '=' {
        return false;
    }
    let Some(first) = chars.next() else {
        return false;
    };
    let body: String = buffer
        .chars()
        .take(buffer.chars().count().saturating_sub(1))
        .collect();
    first.is_ascii_alphabetic()
        && !body.is_empty()
        && body.chars().all(|c| c.is_ascii_alphabetic() || c == '_')
}

fn flush(tokens: &mut Vec<Token>, buffer: &mut String) {
    if buffer.is_empty() {
        return;
    }
    let word = std::mem::take(buffer);
    tokens.push(if word.to_lowercase() == "or" {
        Token::Or
    } else {
        Token::Word(word)
    });
}

fn tokenize(input: &str) -> Result<Vec<Token>, String> {
    let chars: Vec<char> = input.chars().collect();
    let mut tokens = Vec::new();
    let mut buffer = String::new();
    let mut mode = Mode::Normal;
    let mut index = 0;
    while let Some(&c) = chars.get(index) {
        index += 1;
        match mode {
            Mode::Quote | Mode::Regex if c == '\\' && index < chars.len() => {
                buffer.push(c);
                if let Some(&next) = chars.get(index) {
                    buffer.push(next);
                }
                index += 1;
            }
            Mode::Normal if c == '"' => {
                buffer.push(c);
                mode = Mode::Quote;
            }
            Mode::Quote if c == '"' => {
                buffer.push(c);
                mode = Mode::Normal;
            }
            Mode::Normal if c == '/' => {
                if regex_prefix(&buffer) {
                    mode = Mode::Regex;
                }
                buffer.push(c);
            }
            Mode::Regex if c == '/' => {
                buffer.push(c);
                mode = Mode::Normal;
            }
            Mode::Normal if matches!(c, ' ' | '\n' | '\t' | '\r') => {
                flush(&mut tokens, &mut buffer);
            }
            Mode::Normal if c == '(' => {
                flush(&mut tokens, &mut buffer);
                tokens.push(Token::LParen);
            }
            Mode::Normal if c == ')' => {
                flush(&mut tokens, &mut buffer);
                tokens.push(Token::RParen);
            }
            Mode::Normal if c == '-' && buffer.is_empty() => {
                let rest: String = chars.get(index..).unwrap_or_default().iter().collect();
                if rest.trim_start().starts_with('(') {
                    tokens.push(Token::Dash);
                } else {
                    buffer.push('-');
                }
            }
            _ => buffer.push(c),
        }
    }
    match mode {
        Mode::Normal => {
            flush(&mut tokens, &mut buffer);
            Ok(tokens)
        }
        Mode::Quote => Err("unterminated quoted phrase".to_owned()),
        Mode::Regex => Err("unterminated regex".to_owned()),
    }
}

/// Parses a Scryfall query string.
pub fn parse(query: &str) -> Result<Expr, String> {
    let tokens = tokenize(query)?;
    let (expr, rest) = parse_or(&tokens)?;
    match rest.first() {
        None => Ok(simplify(expr)),
        Some(token) => Err(format!("unexpected token {}", token.inspect())),
    }
}

type Parsed<'a> = Result<(Expr, &'a [Token]), String>;

fn parse_or(tokens: &[Token]) -> Parsed<'_> {
    let (mut left, mut rest) = parse_and(tokens)?;
    while let Some((Token::Or, after)) = rest.split_first() {
        let (right, next) = parse_and(after)?;
        left = merge_or(left, right);
        rest = next;
    }
    Ok((left, rest))
}

fn parse_and(mut tokens: &[Token]) -> Parsed<'_> {
    let mut terms = Vec::new();
    loop {
        match tokens.first() {
            None | Some(Token::Or | Token::RParen) => return Ok((and_expr(terms), tokens)),
            Some(_) => {
                let (expr, rest) = parse_unary(tokens)?;
                terms.push(expr);
                tokens = rest;
            }
        }
    }
}

fn parse_unary(tokens: &[Token]) -> Parsed<'_> {
    match tokens.split_first() {
        Some((Token::Dash, rest)) => {
            let (expr, rest) = parse_unary(rest)?;
            Ok((Expr::Not(Box::new(expr)), rest))
        }
        Some((Token::Word(word), rest)) => {
            if let Some(raw) = word.strip_prefix('-').filter(|raw| !raw.is_empty()) {
                return Ok((Expr::Not(Box::new(parse_word(raw))), rest));
            }
            if let Some(raw) = word
                .strip_prefix("not:")
                .or_else(|| word.strip_prefix("NOT:"))
                .filter(|raw| !raw.is_empty())
            {
                let predicate = Expr::Predicate(Predicate {
                    field: Field::Is,
                    op: Op::Colon,
                    value: unquote_value(raw),
                    regex: false,
                });
                return Ok((Expr::Not(Box::new(predicate)), rest));
            }
            parse_primary(tokens)
        }
        _ => parse_primary(tokens),
    }
}

fn parse_primary(tokens: &[Token]) -> Parsed<'_> {
    match tokens.split_first() {
        Some((Token::LParen, rest)) => {
            let (expr, rest) = parse_or(rest)?;
            match rest.split_first() {
                Some((Token::RParen, rest)) => Ok((expr, rest)),
                _ => Err("missing closing parenthesis".to_owned()),
            }
        }
        Some((Token::RParen, _)) => Err("unexpected closing parenthesis".to_owned()),
        Some((Token::Word(raw), rest)) => Ok((parse_word(raw), rest)),
        None => Err("expected search term".to_owned()),
        Some((token, _)) => Err(format!("unexpected token {}", token.inspect())),
    }
}

fn valid_field_name(field: &str) -> bool {
    let mut chars = field.chars();
    chars.next().is_some_and(|c| c.is_ascii_alphabetic())
        && chars.all(|c| c.is_ascii_alphabetic() || c == '_')
}

fn split_predicate(raw: &str) -> Option<(&str, Op, &str)> {
    OPERATORS.iter().find_map(|(operator, op)| {
        let (field, value) = raw.split_once(operator)?;
        (!field.is_empty() && !value.is_empty() && valid_field_name(field))
            .then_some((field, *op, value))
    })
}

fn parse_word(raw: &str) -> Expr {
    if let Some(name) = raw.strip_prefix('!').filter(|name| !name.is_empty()) {
        return Expr::ExactName(unquote_value(name));
    }
    match split_predicate(raw) {
        Some((field, op, value)) => Expr::Predicate(Predicate {
            field: Field::normalize(field),
            op,
            value: unquote_value(value),
            regex: is_regex(value),
        }),
        None => Expr::text(unquote_value(raw)),
    }
}

fn is_regex(value: &str) -> bool {
    value.starts_with('/') && value.ends_with('/')
}

fn unquote_value(value: &str) -> String {
    if is_regex(value) {
        unescape(value.trim_start_matches('/').trim_end_matches('/'))
    } else if value.starts_with('"') && value.ends_with('"') {
        unescape(value.trim_start_matches('"').trim_end_matches('"'))
    } else {
        value.to_owned()
    }
}

fn unescape(value: &str) -> String {
    value.replace("\\\"", "\"").replace("\\\\", "\\")
}

fn merge_or(left: Expr, right: Expr) -> Expr {
    match (left, right) {
        (Expr::Or(mut left), Expr::Or(right)) => {
            left.extend(right);
            Expr::Or(left)
        }
        (Expr::Or(mut left), right) => {
            left.push(right);
            Expr::Or(left)
        }
        (left, Expr::Or(right)) => {
            let mut terms = vec![left];
            terms.extend(right);
            Expr::Or(terms)
        }
        (left, right) => Expr::Or(vec![left, right]),
    }
}

fn and_expr(mut terms: Vec<Expr>) -> Expr {
    if terms.len() == 1
        && let Some(single) = terms.pop()
    {
        return single;
    }
    Expr::And(terms)
}

fn simplify(expr: Expr) -> Expr {
    match expr {
        Expr::And(terms) => {
            let mut terms: Vec<Expr> = terms.into_iter().map(simplify).collect();
            if terms.len() == 1
                && let Some(single) = terms.pop()
            {
                return single;
            }
            Expr::And(terms)
        }
        Expr::Or(terms) => {
            let mut terms: Vec<Expr> = terms.into_iter().map(simplify).collect();
            if terms.len() == 1
                && let Some(single) = terms.pop()
            {
                return single;
            }
            Expr::Or(terms)
        }
        Expr::Not(inner) => Expr::Not(Box::new(simplify(*inner))),
        other => other,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Context {
    Root,
    And,
    Or,
    Not,
}

/// Serializes an AST into a canonical Scryfall-style query string.
#[must_use]
pub fn to_query(expr: &Expr) -> String {
    serialize(expr, Context::Root)
}

fn serialize(expr: &Expr, context: Context) -> String {
    match expr {
        Expr::And(terms) if terms.is_empty() => String::new(),
        Expr::And(terms) => {
            let rendered: Vec<String> = terms.iter().map(|t| serialize(t, Context::And)).collect();
            let rendered = rendered.join(" ");
            if context == Context::Not {
                format!("({rendered})")
            } else {
                rendered
            }
        }
        Expr::Or(terms) => {
            let rendered: Vec<String> = terms.iter().map(|t| serialize(t, Context::Or)).collect();
            let rendered = rendered.join(" or ");
            if matches!(context, Context::And | Context::Not) {
                format!("({rendered})")
            } else {
                rendered
            }
        }
        Expr::Not(inner) => format!("-{}", serialize(inner, Context::Not)),
        Expr::ExactName(name) => format!("!{}", quote_value(name)),
        Expr::Predicate(Predicate {
            field: Field::Text,
            value,
            ..
        }) => quote_value(value),
        Expr::Predicate(Predicate {
            field,
            op,
            value,
            regex,
        }) => {
            let mut out = field.canonical().unwrap_or("text").to_owned();
            out.push_str(op.as_str());
            if *regex {
                let _ = write!(out, "/{}/", value.replace('\\', "\\\\").replace('/', "\\/"));
            } else {
                out.push_str(&quote_value(value));
            }
            out
        }
    }
}

fn quote_value(value: &str) -> String {
    if value
        .chars()
        .any(|c| c.is_whitespace() || c == '(' || c == ')' || c == '"')
    {
        format!("\"{}\"", value.replace('\\', "\\\\").replace('"', "\\\""))
    } else {
        value.to_owned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn pred(field: Field, op: Op, value: &str) -> Expr {
        Expr::Predicate(Predicate {
            field,
            op,
            value: value.to_owned(),
            regex: false,
        })
    }

    fn text(value: &str) -> Expr {
        pred(Field::Text, Op::Colon, value)
    }

    #[test]
    fn parses_empty_input_as_an_empty_conjunction() {
        assert_eq!(parse("  ").unwrap(), Expr::And(vec![]));
    }

    #[test]
    fn parses_loose_text_terms_joined_by_and() {
        assert_eq!(
            parse("black lotus").unwrap(),
            Expr::And(vec![text("black"), text("lotus")])
        );
    }

    #[test]
    fn parses_quoted_text_and_exact_names() {
        assert_eq!(parse("\"black lotus\"").unwrap(), text("black lotus"));
        assert_eq!(
            parse("!\"Black Lotus\"").unwrap(),
            Expr::ExactName("Black Lotus".to_owned())
        );
    }

    #[test]
    fn normalizes_field_aliases() {
        assert_eq!(
            parse(
                "t:legendary o:draw cmc>=3 color<=uw identity=g r!=common e:tdc cn>200 language:ja"
            )
            .unwrap(),
            Expr::And(vec![
                pred(Field::Type, Op::Colon, "legendary"),
                pred(Field::Oracle, Op::Colon, "draw"),
                pred(Field::ManaValue, Op::Gte, "3"),
                pred(Field::Colors, Op::Lte, "uw"),
                pred(Field::Identity, Op::Eq, "g"),
                pred(Field::Rarity, Op::Neq, "common"),
                pred(Field::Set, Op::Colon, "tdc"),
                pred(Field::CollectorNumber, Op::Gt, "200"),
                pred(Field::Language, Op::Colon, "ja"),
            ])
        );
    }

    #[test]
    fn parses_or_groups_nesting_and_negation() {
        assert_eq!(
            parse("(dragon or (t:angel -c:w)) not:funny").unwrap(),
            Expr::And(vec![
                Expr::Or(vec![
                    text("dragon"),
                    Expr::And(vec![
                        pred(Field::Type, Op::Colon, "angel"),
                        Expr::Not(Box::new(pred(Field::Colors, Op::Colon, "w"))),
                    ]),
                ]),
                Expr::Not(Box::new(pred(Field::Is, Op::Colon, "funny"))),
            ])
        );
        assert_eq!(
            parse("-(a b)").unwrap(),
            Expr::Not(Box::new(Expr::And(vec![text("a"), text("b")])))
        );
    }

    #[test]
    fn parses_regex_values() {
        assert_eq!(
            parse("o:/^draw.*card$/").unwrap(),
            Expr::Predicate(Predicate {
                field: Field::Oracle,
                op: Op::Colon,
                value: "^draw.*card$".to_owned(),
                regex: true,
            })
        );
        // A slash outside a field prefix is ordinary text.
        assert_eq!(parse("a/b").unwrap(), text("a/b"));
    }

    #[test]
    fn reports_unbalanced_syntax() {
        assert_eq!(parse("(dragon or angel)").is_ok(), true);
        assert_eq!(
            parse("(dragon or angel").unwrap_err(),
            "missing closing parenthesis"
        );
        assert_eq!(
            parse("name:\"Black Lotus").unwrap_err(),
            "unterminated quoted phrase"
        );
        assert_eq!(parse("o:/draw").unwrap_err(), "unterminated regex");
        assert_eq!(parse("a)").unwrap_err(), "unexpected token :rparen");
    }

    #[test]
    fn unknown_and_canonical_fields() {
        assert_eq!(
            parse("zzqtotallyunknown:value").unwrap(),
            pred(Field::Unknown, Op::Colon, "value")
        );
        assert_eq!(
            parse("mana_value:3").unwrap(),
            pred(Field::ManaValue, Op::Colon, "3")
        );
        assert_eq!(
            parse("collector_number:5").unwrap(),
            pred(Field::CollectorNumber, Op::Colon, "5")
        );
        // Values with a missing side stay loose text.
        assert_eq!(parse("t:").unwrap(), text("t:"));
        assert_eq!(parse("1:2").unwrap(), text("1:2"));
    }

    #[test]
    fn round_trips_canonical_syntax() {
        let queries = [
            "black lotus",
            "!\"Black Lotus\"",
            "name:\"Black Lotus\"",
            "type:legendary oracle:draw mana:{G} mv>=3",
            "c=2 id<=uw rarity>=rare set:tdc number>200 lang:ja",
            "usd<10 year>=2020 date<2025-01-01",
            "paid>=2.50 paid<=10 added>=2026-01-01 added<=2026-01-31",
            "is:foil -is:funny",
            "(dragon or angel) -type:creature",
            "(type:artifact rarity:rare) or (type:sorcery rarity:mythic)",
            "oracle:/^draw.*card$/",
        ];
        for query in queries {
            let first = parse(query).unwrap();
            let rendered = to_query(&first);
            assert_eq!(parse(&rendered).unwrap(), first, "{query} -> {rendered}");
        }
    }

    #[test]
    fn serializes_aliases_to_canonical_names() {
        assert_eq!(
            to_query(&parse("t:artifact o:mana cmc=0 e:lea cn:232").unwrap()),
            "type:artifact oracle:mana mv=0 set:lea number:232"
        );
    }
}
