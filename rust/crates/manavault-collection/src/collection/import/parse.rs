//! Parsing collection import files (`Manavault.Catalog.CollectionImport`):
//! CSV exports with flexible headers, and decklist-style text lines such as
//! `2x Time Walk (LEA) 84 *F*`.

use std::collections::HashMap;
use std::sync::LazyLock;

use regex::Regex;

use crate::catalog::price::parse_cents;

/// An import file format (`normalize_format/1`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Format {
    Auto,
    Csv,
    Txt,
    Unknown,
}

impl Format {
    /// Reads a format name or MIME type; blank is `Auto`.
    #[must_use]
    pub fn parse(value: Option<&str>) -> Self {
        let Some(value) = value else {
            return Self::Auto;
        };
        match value.trim().to_lowercase().as_str() {
            "" | "auto" => Self::Auto,
            "csv"
            | "text/csv"
            | "text/comma-separated-values"
            | "application/csv"
            | "application/vnd.ms-excel" => Self::Csv,
            "text" | "txt" | "plain" | "text/plain" => Self::Txt,
            _ => Self::Unknown,
        }
    }
}

/// Why a file could not be parsed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
pub enum ParseError {
    /// `:invalid_import_format`.
    #[error("Import file must be a CSV or TXT file.")]
    InvalidFormat,
    /// `:invalid_import_file`.
    #[error("Could not parse that import file.")]
    InvalidFile,
}

/// A parsed row: normalized header → cell text.
pub type RawRow = HashMap<String, String>;

/// Parses an import file into rows with their line (or CSV record) numbers
/// (`CollectionImport.parse/2`).
pub fn parse(
    text: &str,
    format: Format,
    file_name: Option<&str>,
) -> Result<Vec<(RawRow, i64)>, ParseError> {
    let format = match format {
        Format::Auto => match file_format(file_name) {
            Some(format) => format,
            None if csv_like(text)? => Format::Csv,
            None => Format::Txt,
        },
        other => other,
    };
    match format {
        Format::Csv => parse_csv_entries(text),
        Format::Txt | Format::Auto => Ok(parse_text_entries(text)),
        Format::Unknown => Err(ParseError::InvalidFormat),
    }
}

fn normalize_newlines(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

fn file_format(file_name: Option<&str>) -> Option<Format> {
    let extension = std::path::Path::new(file_name?)
        .extension()?
        .to_str()?
        .to_lowercase();
    match extension.as_str() {
        "csv" => Some(Format::Csv),
        "txt" => Some(Format::Txt),
        _ => None,
    }
}

fn csv_like(text: &str) -> Result<bool, ParseError> {
    let text = normalize_newlines(text);
    let first = text.split('\n').find(|line| !line.is_empty()).unwrap_or("");
    if !first.contains(',') {
        return Ok(false);
    }
    Ok(match parse_csv(first)?.first() {
        Some(headers) => headers
            .iter()
            .any(|header| matches!(normalize_header(header).as_str(), "name" | "quantity")),
        None => false,
    })
}

/// Splits CSV text into records the way `NimbleCSV` does: `"` starts a
/// quoted field (`""` escapes a quote), and a quote anywhere else is an
/// error, as is an unterminated quoted field.
fn split_csv(text: &str) -> Result<Vec<Vec<String>>, ParseError> {
    let mut rows = Vec::new();
    let mut row: Vec<String> = Vec::new();
    let mut field = String::new();
    let mut chars = text.chars().peekable();
    let mut at_field_start = true;
    let mut row_started = false;
    while let Some(c) = chars.next() {
        row_started = true;
        if at_field_start && c == '"' {
            at_field_start = false;
            loop {
                match chars.next() {
                    None => return Err(ParseError::InvalidFile),
                    Some('"') if chars.peek() == Some(&'"') => {
                        chars.next();
                        field.push('"');
                    }
                    Some('"') => break,
                    Some(other) => field.push(other),
                }
            }
            match chars.peek() {
                None | Some(',' | '\n') => {}
                Some(_) => return Err(ParseError::InvalidFile),
            }
            continue;
        }
        match c {
            ',' => {
                row.push(std::mem::take(&mut field));
                at_field_start = true;
            }
            '\n' => {
                row.push(std::mem::take(&mut field));
                rows.push(std::mem::take(&mut row));
                at_field_start = true;
                row_started = false;
            }
            '"' => return Err(ParseError::InvalidFile),
            other => {
                at_field_start = false;
                field.push(other);
            }
        }
    }
    if row_started {
        row.push(field);
        rows.push(row);
    }
    Ok(rows)
}

/// CSV records with trimmed cells, blank records dropped (`parse_csv/1`).
fn parse_csv(text: &str) -> Result<Vec<Vec<String>>, ParseError> {
    Ok(split_csv(&normalize_newlines(text))?
        .into_iter()
        .map(|cells| {
            cells
                .into_iter()
                .map(|cell| cell.trim().to_owned())
                .collect::<Vec<_>>()
        })
        .filter(|cells| !cells.iter().all(String::is_empty))
        .collect())
}

/// Lowercase words joined with `_` (`[^a-z0-9]+` → `_`, trimmed).
fn snake(value: &str) -> String {
    let mut out = String::new();
    let mut gap = false;
    for c in value.trim().to_lowercase().chars() {
        if c.is_ascii_lowercase() || c.is_ascii_digit() {
            if gap && !out.is_empty() {
                out.push('_');
            }
            gap = false;
            out.push(c);
        } else {
            gap = true;
        }
    }
    out
}

/// Canonical column names for the headers of common exports.
fn normalize_header(header: &str) -> String {
    let key = snake(header);
    match key.as_str() {
        "card" | "card_name" | "name" => "name",
        "set" | "set_code" | "edition" => "set_code",
        "collector" | "collector_number" | "number" | "cn" => "collector_number",
        "qty" | "count" | "quantity" => "quantity",
        "foil" | "foiling" | "finish" => "finish",
        "condition" | "cond" => "condition",
        "language" | "lang" => "language",
        "purchase_price" | "purchase_price_usd" | "price_paid" | "paid" => "purchase_price_cents",
        "scryfall" | "scryfall_id" | "printing_id" => "scryfall_id",
        "back_scryfall" | "back_scryfall_id" | "back_printing_id" => "back_scryfall_id",
        _ => return key,
    }
    .to_owned()
}

fn parse_csv_entries(text: &str) -> Result<Vec<(RawRow, i64)>, ParseError> {
    let mut records = parse_csv(text)?.into_iter();
    let Some(headers) = records.next() else {
        return Ok(Vec::new());
    };
    let headers: Vec<String> = headers.iter().map(|h| normalize_header(h)).collect();
    Ok(records
        .zip(2..)
        .map(|(cells, row_number)| {
            let row = headers
                .iter()
                .enumerate()
                .map(|(index, header)| {
                    (
                        header.clone(),
                        cells.get(index).cloned().unwrap_or_default(),
                    )
                })
                .collect();
            (row, row_number)
        })
        .collect())
}

static QUANTITY: LazyLock<Option<Regex>> =
    LazyLock::new(|| Regex::new(r"(?i)\A(\d+)(?:\s*x)?\s+(.+)\z").ok());
static FINISHES: LazyLock<Vec<(Regex, &'static str)>> = LazyLock::new(|| {
    [
        (r"(?i)\s+\*F\*\s*\z", "foil"),
        (r"(?i)\s+\*E\*\s*\z", "etched"),
        (r"(?i)\s+\[(?:foil|foiled)\]\s*\z", "foil"),
        (
            r"(?i)\s+\[(?:etched|foil etched|foil_etched)\]\s*\z",
            "etched",
        ),
    ]
    .into_iter()
    .filter_map(|(pattern, finish)| Some((Regex::new(pattern).ok()?, finish)))
    .collect()
});
static PRINTING: LazyLock<Option<Regex>> = LazyLock::new(|| {
    Regex::new(r"\A(?P<name>.+?)\s+\((?P<set>[A-Za-z0-9]+)\)\s+(?P<number>\S+)\z").ok()
});

fn parse_text_entries(text: &str) -> Vec<(RawRow, i64)> {
    normalize_newlines(text)
        .split('\n')
        .zip(1..)
        .filter(|(line, _)| !line.trim().is_empty())
        .map(|(line, row_number)| (parse_text_line(line), row_number))
        .collect()
}

fn parse_text_line(line: &str) -> RawRow {
    let line = line.trim();
    let (quantity, rest) = match QUANTITY.as_ref().and_then(|re| re.captures(line)) {
        Some(captures) => (
            captures.get(1).map_or("1", |m| m.as_str()).to_owned(),
            captures.get(2).map_or("", |m| m.as_str()).trim().to_owned(),
        ),
        None => ("1".to_owned(), line.to_owned()),
    };
    let (rest, finish) = FINISHES
        .iter()
        .find(|(pattern, _)| pattern.is_match(&rest))
        .map_or((rest.clone(), None), |(pattern, finish)| {
            (pattern.replace(&rest, "").trim().to_owned(), Some(*finish))
        });
    let mut row: RawRow = match PRINTING.as_ref().and_then(|re| re.captures(&rest)) {
        Some(captures) => [
            (
                "name",
                captures.name("name").map_or("", |m| m.as_str()).trim(),
            ),
            ("set_code", captures.name("set").map_or("", |m| m.as_str())),
            (
                "collector_number",
                captures.name("number").map_or("", |m| m.as_str()),
            ),
        ]
        .into_iter()
        .map(|(key, value)| (key.to_owned(), value.to_owned()))
        .collect(),
        None => [
            ("name", rest.as_str()),
            ("set_code", ""),
            ("collector_number", ""),
        ]
        .into_iter()
        .map(|(key, value)| (key.to_owned(), value.to_owned()))
        .collect(),
    };
    row.insert("quantity".to_owned(), quantity);
    row.insert("finish".to_owned(), finish.unwrap_or("nonfoil").to_owned());
    row
}

/// A row's import attributes (`CollectionImport.attrs/1`).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RowAttrs {
    pub name: String,
    pub set_code: String,
    pub collector_number: String,
    pub quantity: i64,
    pub finish: String,
    pub condition: String,
    pub language: String,
    pub scryfall_id: String,
    pub back_scryfall_id: String,
    pub purchase_price_cents: Option<i64>,
}

/// `Util.parse_quantity/1`: a whole integer, else 1.
fn parse_quantity(value: &str) -> i64 {
    crate::catalog::search::predicates::parse_int(value).unwrap_or(1)
}

/// The finish named in a cell; anything unknown is nonfoil.
///
/// Bug in earlier releases: the cell was not lower-cased, so `Foil` or `FOIL` imported as
/// nonfoil. Matching ignores case here.
fn normalize_finish(value: &str) -> String {
    match value.trim().to_lowercase().replace(' ', "_").as_str() {
        "foil" | "true" | "yes" | "y" => "foil",
        "etched" | "foil_etched" => "etched",
        _ => "nonfoil",
    }
    .to_owned()
}

/// The condition named in a cell (`NM`, `lightly played`, ...); anything
/// unknown is near mint.
///
/// Bug in earlier releases: the cell was not lower-cased before `[^a-z0-9]+` was replaced,
/// so every upper-case grading (`LP`, `Lightly Played`, `MP`) imported as
/// near mint. Matching ignores case here.
fn normalize_condition(value: &str) -> String {
    match snake(value).as_str() {
        "lp" | "lightly_played" | "light_played" => "lightly_played",
        "mp" | "moderately_played" | "mod_played" => "moderately_played",
        "hp" | "heavily_played" | "heavy_played" => "heavily_played",
        "d" | "dm" | "damaged" => "damaged",
        _ => "near_mint",
    }
    .to_owned()
}

#[must_use]
pub fn attrs(row: &RawRow) -> RowAttrs {
    let get = |key: &str| row.get(key).map(|value| value.trim().to_owned());
    RowAttrs {
        name: get("name").unwrap_or_default(),
        set_code: get("set_code").unwrap_or_default(),
        collector_number: get("collector_number").unwrap_or_default(),
        quantity: row.get("quantity").map_or(1, |q| parse_quantity(q)),
        finish: normalize_finish(row.get("finish").map_or("", String::as_str)),
        condition: normalize_condition(row.get("condition").map_or("", String::as_str)),
        language: get("language")
            .filter(|language| !language.is_empty())
            .unwrap_or_else(|| "en".to_owned()),
        scryfall_id: get("scryfall_id").unwrap_or_default(),
        back_scryfall_id: get("back_scryfall_id").unwrap_or_default(),
        purchase_price_cents: row.get("purchase_price_cents").and_then(|p| parse_cents(p)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rows(text: &str) -> Vec<RawRow> {
        parse(text, Format::Csv, None)
            .unwrap()
            .into_iter()
            .map(|(row, _)| row)
            .collect()
    }

    #[test]
    fn parses_quoted_fields_with_commas_escaped_quotes_and_blank_rows() {
        let csv = "Quantity,Card Name,Set Code,Collector Number\n2,\"Fire, Ice\", apc , 128\n\n1,\"He said \"\"hi\"\"\",xyz,7\n";
        let entries = parse(csv, Format::Csv, None).unwrap();
        assert_eq!(entries.len(), 2);
        let (first, first_number) = &entries[0];
        assert_eq!(*first_number, 2);
        assert_eq!(first["quantity"], "2");
        assert_eq!(first["name"], "Fire, Ice");
        assert_eq!(first["set_code"], "apc");
        assert_eq!(first["collector_number"], "128");
        let (second, _) = &entries[1];
        assert_eq!(second["name"], "He said \"hi\"");
        assert_eq!(second["set_code"], "xyz");
        assert_eq!(second["collector_number"], "7");
    }

    #[test]
    fn handles_crlf_and_lone_cr_line_endings() {
        let names: Vec<String> = rows("Quantity,Card Name\r\n1,Alpha\r2,Beta\r\n")
            .into_iter()
            .map(|row| row["name"].clone())
            .collect();
        assert_eq!(names, ["Alpha", "Beta"]);
    }

    #[test]
    fn reads_the_scanner_purchase_price_column_as_cents() {
        let csv = "name,set_code,collector_number,quantity,finish,language,scryfall_id,back_scryfall_id,purchase_price\nLightning Bolt,m10,146,1,nonfoil,en,sf-1,,1.50\nLightning Bolt,m10,146,1,nonfoil,en,sf-2,,\n";
        let prices: Vec<Option<i64>> = rows(csv)
            .iter()
            .map(|row| attrs(row).purchase_price_cents)
            .collect();
        assert_eq!(prices, [Some(150), None]);
    }

    #[test]
    fn stray_or_unterminated_quotes_are_invalid() {
        for csv in [
            "Quantity,Card Name\n1,ab\"c\n",
            "Quantity,Card Name\n1,\"abc\n",
            "Quantity,Card Name\n1,\"ab\"c\n",
            "Quantity,Card Name\n1, \"abc\" \n",
        ] {
            assert_eq!(
                parse(csv, Format::Csv, None),
                Err(ParseError::InvalidFile),
                "{csv}"
            );
        }
        assert_eq!(
            parse("x", Format::Unknown, None),
            Err(ParseError::InvalidFormat)
        );
    }

    #[test]
    fn gradings_and_finishes_ignore_case() {
        let csv = "Quantity,Card Name,Condition,Finish\n1,X,LP,Foil\n1,Y,Moderately Played,etched\n1,Z,,\n";
        let parsed: Vec<(String, String)> = rows(csv)
            .iter()
            .map(attrs)
            .map(|a| (a.condition, a.finish))
            .collect();
        assert_eq!(
            parsed,
            [
                ("lightly_played".into(), "foil".into()),
                ("moderately_played".into(), "etched".into()),
                ("near_mint".into(), "nonfoil".into())
            ]
        );
    }

    #[test]
    fn text_lines_carry_quantity_printing_and_finish() {
        let entries = parse(
            "1x Black Lotus (LEA) 232\n\n2x Time Walk (LEA) 84 *F*\nLightning Bolt [etched]\n3 Opt",
            Format::Auto,
            None,
        )
        .unwrap();
        let summary: Vec<(String, String, String, String, String, i64)> = entries
            .iter()
            .map(|(row, number)| {
                (
                    row["quantity"].clone(),
                    row["name"].clone(),
                    row["set_code"].clone(),
                    row["collector_number"].clone(),
                    row["finish"].clone(),
                    *number,
                )
            })
            .collect();
        assert_eq!(
            summary,
            [
                (
                    "1".into(),
                    "Black Lotus".into(),
                    "LEA".into(),
                    "232".into(),
                    "nonfoil".into(),
                    1
                ),
                (
                    "2".into(),
                    "Time Walk".into(),
                    "LEA".into(),
                    "84".into(),
                    "foil".into(),
                    3
                ),
                (
                    "1".into(),
                    "Lightning Bolt".into(),
                    String::new(),
                    String::new(),
                    "etched".into(),
                    4
                ),
                (
                    "3".into(),
                    "Opt".into(),
                    String::new(),
                    String::new(),
                    "nonfoil".into(),
                    5
                ),
            ]
        );
    }

    #[test]
    fn detects_formats() {
        assert_eq!(Format::parse(Some("text/csv")), Format::Csv);
        assert_eq!(Format::parse(Some(" TXT ")), Format::Txt);
        assert_eq!(Format::parse(None), Format::Auto);
        assert_eq!(Format::parse(Some("xlsx")), Format::Unknown);
        // A comma line without a known header is text.
        let entries = parse("1 Fire, Ice", Format::Auto, None).unwrap();
        assert_eq!(entries[0].0["name"], "Fire, Ice");
        let entries = parse("Count,Name\n2,Opt", Format::Auto, None).unwrap();
        assert_eq!(entries[0].0["quantity"], "2");
        let entries = parse("2 Opt", Format::Auto, Some("cards.CSV")).unwrap();
        assert_eq!(entries.len(), 0);
    }
}
