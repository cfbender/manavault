//! Link previews of shared decks (`ManavaultWeb.DeckSharePreview`): the
//! page metadata, the 1200×630 SVG header, and its PNG rendering through a
//! content-addressed artifact cache.

pub mod artifact_cache;
pub mod artifact_store;
pub mod cover_fetcher;
pub mod render_worker;
pub mod renderer;

use std::fmt::Write as _;

use serde::{Deserialize, Serialize};

use manavault_catalog::pricing::PriceStore;
use manavault_collection::decks::contents::{self, DeckContents};
use manavault_collection::decks::model::DeckRow;
use manavault_core::web::app_shell::escape;

/// Preview image width.
pub const IMAGE_WIDTH: u32 = 1200;
/// Preview image height.
pub const IMAGE_HEIGHT: u32 = 630;
/// `@source_version`: bump when the SVG markup changes.
pub const SOURCE_VERSION: &str = "deck-share-preview-v4";

/// The deck-specific preview (`DeckSharePreview.from_deck/2`). Everything
/// the SVG draws is here, so the PNG cache can fingerprint it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeckPreview {
    /// The share token; part of the fingerprint only (never sent to jobs).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    pub deck_name: String,
    pub image_alt: String,
    pub cover_image_url: Option<String>,
    pub format_label: String,
    pub status_label: String,
    pub card_count_label: String,
    pub bracket_label: Option<String>,
    pub legality_label: String,
    pub price_label: Option<String>,
    pub color_identity: Vec<String>,
}

/// The page metadata of a shared deck: title and description for the
/// shell, plus the drawable [`DeckPreview`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeckPage {
    pub title: String,
    pub description: String,
    pub preview: DeckPreview,
}

/// `titleize/1`: `pauper_commander` → `Pauper Commander`.
#[must_use]
pub fn titleize(value: &str) -> String {
    value
        .replace(['_', '-'], " ")
        .split(' ')
        .filter(|word| !word.is_empty())
        .map(capitalize)
        .collect::<Vec<_>>()
        .join(" ")
}

/// `String.capitalize/1`: first letter upper case, the rest lower case.
fn capitalize(word: &str) -> String {
    let mut chars = word.chars();
    match chars.next() {
        Some(first) => first
            .to_uppercase()
            .chain(chars.flat_map(char::to_lowercase))
            .collect(),
        None => String::new(),
    }
}

/// `compact_number/1`: `999`, `1.5k`, `2m`. Rounds tenths half up.
#[must_use]
pub fn compact_number(value: u32) -> String {
    let compact = |divisor: u32, suffix: &str| {
        let tenths = (u64::from(value) * 10 + u64::from(divisor) / 2) / u64::from(divisor);
        if tenths % 10 == 0 {
            format!("{}{suffix}", tenths / 10)
        } else {
            format!("{}.{}{suffix}", tenths / 10, tenths % 10)
        }
    };
    if value >= 1_000_000 {
        compact(1_000_000, "m")
    } else if value >= 1_000 {
        compact(1_000, "k")
    } else {
        value.to_string()
    }
}

/// `format_price_cents/1`: `$5` or `$5.07`.
#[must_use]
pub fn format_price_cents(cents: i64) -> String {
    let dollars = cents / 100;
    let remainder = cents % 100;
    if remainder == 0 {
        format!("${dollars}")
    } else {
        format!("${dollars}.{:02}", remainder.abs())
    }
}

/// `Price.deck_cards_total_cents/1` over the cards that count toward the
/// deck: each card's preferred printing (else its newest printing) in the
/// card's finish.
#[must_use]
pub fn total_price_cents(prices: &PriceStore, contents: &DeckContents) -> i64 {
    contents
        .cards
        .iter()
        .filter(|card| card.row.counts_toward_deck())
        .fold(0i64, |total, card| {
            let printing = card
                .preferred_printing
                .as_ref()
                .or(card.fallback_printing.as_ref());
            let cents = printing
                .and_then(|printing| {
                    printing.price_cents_for(prices, Some(card.row.finish.as_str()))
                })
                .unwrap_or(0);
            total.saturating_add(card.row.quantity.as_i64().saturating_mul(cents))
        })
}

/// `bracket_label/1`: only official brackets 1–5 show.
fn bracket_label(deck: &DeckRow) -> Option<String> {
    let official = deck
        .commander_bracket
        .filter(|bracket| (1..=5).contains(bracket))?;
    Some(manavault_ai::ai::deck_analysis::result::bracket_label(
        official,
        deck.commander_bracket_estimate,
        deck.commander_bracket_rating.as_deref(),
    ))
}

impl DeckPage {
    /// `DeckSharePreview.from_deck/2`.
    #[must_use]
    pub fn from_deck(
        deck: &DeckRow,
        contents: &DeckContents,
        prices: &PriceStore,
        token: &str,
    ) -> Self {
        let card_count = manavault_collection::decks::model::counted_quantity(contents.rows());
        let format_label = titleize(deck.format.as_str());
        let legality_label = if contents.legality(deck.format).status == "legal" {
            "Legal"
        } else {
            "Illegal"
        };
        let bracket_label = bracket_label(deck);
        let price_label = format_price_cents(total_price_cents(prices, contents));
        let deck_name = deck.name.clone();
        let card_count_label = format!("{} cards", compact_number(card_count));
        let description = [
            Some(format!("{format_label} deck")),
            Some(card_count_label.clone()),
            bracket_label.clone(),
            Some(legality_label.to_owned()),
            Some(price_label.clone()),
        ]
        .into_iter()
        .flatten()
        .filter(|part| !blank(part))
        .collect::<Vec<_>>()
        .join(", ");
        Self {
            title: format!("{deck_name} · ManaVault"),
            description: format!("{description}."),
            preview: DeckPreview {
                token: Some(token.to_owned()),
                image_alt: format!("Preview for {deck_name}"),
                deck_name,
                cover_image_url: contents::cover_image_url(
                    &contents.cards,
                    deck.cover_deck_card_id,
                ),
                format_label,
                status_label: titleize(deck.status.as_str()),
                card_count_label,
                bracket_label,
                legality_label: legality_label.to_owned(),
                price_label: Some(price_label),
                color_identity: contents::commander_color_identity(&contents.cards)
                    .unwrap_or_default(),
            },
        }
    }
}

/// `one_line/1`: runs of whitespace become one space, then trimmed.
#[must_use]
pub fn one_line(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    let mut in_space = false;
    for c in value.chars() {
        if matches!(c, ' ' | '\t' | '\n' | '\u{0B}' | '\u{0C}' | '\r') {
            if !in_space {
                out.push(' ');
            }
            in_space = true;
        } else {
            out.push(c);
            in_space = false;
        }
    }
    out.trim().to_owned()
}

fn blank(value: &str) -> bool {
    one_line(value).is_empty()
}

fn char_count(value: &str) -> u32 {
    u32::try_from(value.chars().count()).unwrap_or(u32::MAX)
}

/// The smallest integer at or above `x` (`ceil/1` on a float), searched
/// from an exact-arithmetic estimate so the float rounding matches earlier
/// releases.
fn ceil_u32(x: f64, estimate: u32) -> u32 {
    let mut n = estimate;
    while f64::from(n) < x {
        n = n.saturating_add(1);
    }
    while n > 0 && f64::from(n - 1) >= x {
        n -= 1;
    }
    n
}

/// The largest integer at or below `x` (`floor/1` on a float).
fn floor_u32(x: f64, estimate: u32) -> u32 {
    let mut n = estimate;
    while n > 0 && f64::from(n) > x {
        n -= 1;
    }
    while f64::from(n.saturating_add(1)) <= x && n < u32::MAX {
        n += 1;
    }
    n
}

/// `text_width/2`: `ceil(length * font_size * 0.72)`.
fn text_width(label: &str, font_size: u32) -> u32 {
    let length = char_count(label);
    let x = f64::from(length) * (f64::from(font_size) * 0.72);
    let estimate = length.saturating_mul(font_size).saturating_mul(72) / 100;
    ceil_u32(x, estimate)
}

fn badge_width(label: &str) -> u32 {
    (text_width(label, 22) + 44).max(90)
}

fn title_font_size(name: &str) -> u32 {
    match char_count(name) {
        0..=24 => 72,
        25..=34 => 62,
        _ => 52,
    }
}

fn title_width(colors: &[String]) -> u32 {
    if colors.iter().any(|color| !blank(color)) {
        760
    } else {
        1040
    }
}

/// `truncate_for_width/3`.
fn truncate_for_width(value: &str, max_width: u32, font_size: u32) -> String {
    let x = f64::from(max_width) / (f64::from(font_size) * 0.72);
    let estimate = max_width.saturating_mul(100) / font_size.saturating_mul(72).max(1);
    let max_length = floor_u32(x, estimate).max(8);
    if char_count(value) <= max_length {
        value.to_owned()
    } else {
        let kept: String = value
            .chars()
            .take(usize::try_from(max_length - 1).unwrap_or(0))
            .collect();
        format!("{kept}…")
    }
}

/// `symbol_code/1`: `W/U` → `WU`, upper case, URI-encoded.
#[must_use]
pub fn symbol_code(color: &str) -> String {
    let mut out = String::new();
    for byte in color.replace('/', "").to_uppercase().bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            out.push(char::from(byte));
        } else {
            let _ = write!(out, "%{byte:02X}");
        }
    }
    out
}

/// `mana_symbol_url/1`: the symbol served by `/scryfall-assets`.
#[must_use]
pub fn mana_symbol_url(color: &str) -> String {
    format!("/scryfall-assets/symbols/{}.svg", symbol_code(color))
}

#[derive(Clone, Copy)]
enum Tone {
    Neutral,
    Success,
    Error,
    Warning,
}

impl Tone {
    fn colors(self) -> (&'static str, &'static str, &'static str) {
        match self {
            Self::Success => ("#86efac", "#16321f", "#d7ffe3"),
            Self::Error => ("#fca5a5", "#3a1717", "#ffe2e2"),
            Self::Warning => ("#facc15", "#38270b", "#fff3bd"),
            Self::Neutral => ("#f0d7c4", "#2a1d22", "#f8f0ef"),
        }
    }
}

fn badge(x: u32, y: u32, label: &str, tone: Tone) -> String {
    let label = one_line(label);
    let width = badge_width(&label);
    let (stroke, fill, text) = tone.colors();
    format!(
        "<g>\n  <rect x=\"{x}\" y=\"{y}\" width=\"{width}\" height=\"42\" rx=\"9\" fill=\"{fill}\" stroke=\"{stroke}\" stroke-opacity=\"0.78\" stroke-width=\"2\" />\n  <text x=\"{}\" y=\"{}\" fill=\"{text}\" font-size=\"22\" font-weight=\"750\">{}</text>\n</g>\n",
        x + 22,
        y + 29,
        escape(&label)
    )
}

fn background_markup(url: Option<&str>) -> String {
    match url.filter(|url| !url.is_empty()) {
        Some(url) => format!(
            "<image href=\"{}\" x=\"0\" y=\"0\" width=\"1200\" height=\"630\" preserveAspectRatio=\"xMidYMid slice\" opacity=\"0.78\" />",
            escape(url)
        ),
        None => "<rect width=\"1200\" height=\"630\" fill=\"#211722\" />".to_owned(),
    }
}

fn mana_symbols(colors: &[String], symbol: &dyn Fn(&str) -> String) -> String {
    colors
        .iter()
        .filter(|color| !blank(color))
        .take(5)
        .zip(0u32..)
        .map(|(color, index)| {
            let x = 890 + index * 54;
            format!(
                "<g filter=\"url(#softShadow)\">\n  <image href=\"{}\" x=\"{}\" y=\"327\" width=\"48\" height=\"48\" preserveAspectRatio=\"xMidYMid meet\" />\n</g>\n",
                escape(&symbol(color)),
                x - 24
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}

impl DeckPreview {
    /// `DeckSharePreview.svg/2` with symbols linked from `/scryfall-assets`.
    #[must_use]
    pub fn svg(&self) -> String {
        self.svg_with(&|color| mana_symbol_url(color))
    }

    /// The SVG with mana symbols from `symbol` (the renderer embeds them as
    /// data URIs).
    #[must_use]
    pub fn svg_with(&self, symbol: &dyn Fn(&str) -> String) -> String {
        let deck_name = one_line(&self.deck_name);
        let title_size = title_font_size(&deck_name);
        let deck_name =
            truncate_for_width(&deck_name, title_width(&self.color_identity), title_size);
        let legality_x = 72 + badge_width(&self.status_label) + 20;
        let price_label = self.price_label.as_deref().unwrap_or("");
        let price_x = legality_x + badge_width(&self.legality_label) + 20;
        let bracket_x = 72 + badge_width(&self.format_label) + 20;
        let card_count_x = match &self.bracket_label {
            None => 96 + badge_width(&self.format_label),
            Some(bracket) => 116 + badge_width(&self.format_label) + badge_width(bracket),
        };
        let bracket = self
            .bracket_label
            .as_deref()
            .map(|label| badge(bracket_x, 74, label, Tone::Warning))
            .unwrap_or_default();
        let legality_tone = if self.legality_label == "Legal" {
            Tone::Success
        } else {
            Tone::Error
        };
        format!(
            r##"<svg xmlns="http://www.w3.org/2000/svg" width="{IMAGE_WIDTH}" height="{IMAGE_HEIGHT}" viewBox="0 0 {IMAGE_WIDTH} {IMAGE_HEIGHT}" role="img" aria-label="{alt}">
  <defs>
    <linearGradient id="manavaultShade" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#171018" stop-opacity="0.96" />
      <stop offset="48%" stop-color="#251827" stop-opacity="0.82" />
      <stop offset="100%" stop-color="#2b1720" stop-opacity="0.54" />
    </linearGradient>
    <radialGradient id="manavaultGlow" cx="82%" cy="18%" r="74%">
      <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.34" />
      <stop offset="52%" stop-color="#a855f7" stop-opacity="0.14" />
      <stop offset="100%" stop-color="#020617" stop-opacity="0" />
    </radialGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="#000000" flood-opacity="0.45" />
    </filter>
    <clipPath id="cardClip">
      <rect x="32" y="32" width="1136" height="566" rx="34" />
    </clipPath>
  </defs>
  <style>
    text {{ font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }}
  </style>
  <g clip-path="url(#cardClip)">
    {background}
    <rect width="1200" height="630" fill="url(#manavaultShade)" />
    <rect width="1200" height="630" fill="url(#manavaultGlow)" />
  </g>
  <rect x="32" y="32" width="1136" height="566" rx="34" fill="none" stroke="#ffffff" stroke-opacity="0.13" stroke-width="2" />

  {format_badge}
  {bracket}
  <text x="{card_count_x}" y="111" fill="#e7dfdf" fill-opacity="0.78" font-size="30" font-weight="800">{card_count}</text>

  <g filter="url(#softShadow)">
    <text x="72" y="372" fill="#f8f0ef" font-size="{title_size}" font-weight="950" letter-spacing="-1.6">{deck_name}</text>
  </g>
  {symbols}

  {status_badge}
  {legality_badge}
  {price_badge}

  <text x="72" y="548" fill="#e7dfdf" fill-opacity="0.48" font-size="24" font-weight="700">Shared with ManaVault</text>
</svg>
"##,
            alt = escape(&self.image_alt),
            background = background_markup(self.cover_image_url.as_deref()),
            format_badge = badge(72, 74, &self.format_label, Tone::Neutral),
            card_count = escape(&self.card_count_label),
            deck_name = escape(&deck_name),
            symbols = mana_symbols(&self.color_identity, symbol),
            status_badge = badge(72, 432, &self.status_label, Tone::Success),
            legality_badge = badge(legality_x, 432, &self.legality_label, legality_tone),
            price_badge = badge(price_x, 432, price_label, Tone::Warning),
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn preview() -> DeckPreview {
        DeckPreview {
            token: None,
            deck_name: "Preview Deck".into(),
            image_alt: "Preview for Preview Deck".into(),
            cover_image_url: None,
            format_label: "Commander".into(),
            status_label: "Active".into(),
            card_count_label: "60 cards".into(),
            bracket_label: None,
            legality_label: "Legal".into(),
            price_label: Some("$1".into()),
            color_identity: vec!["W".into(), "U/P".into()],
        }
    }

    #[test]
    fn labels_match_earlier_releases() {
        assert_eq!(titleize("pauper_commander"), "Pauper Commander");
        assert_eq!(titleize("ACTIVE"), "Active");
        assert_eq!(compact_number(100), "100");
        assert_eq!(compact_number(1_000), "1k");
        assert_eq!(compact_number(1_250), "1.3k");
        assert_eq!(compact_number(2_000_000), "2m");
        assert_eq!(format_price_cents(25_676), "$256.76");
        assert_eq!(format_price_cents(500), "$5");
        assert_eq!(format_price_cents(507), "$5.07");
        assert_eq!(symbol_code("u/p"), "UP");
        assert_eq!(symbol_code("2 W"), "2%20W");
        assert_eq!(one_line("  a \n\t b  "), "a b");
        // 9 * 22 * 0.72 = 142.56 → 143, + 44.
        assert_eq!(badge_width("Commander"), 187);
        assert_eq!(badge_width("$1"), 90);
        assert_eq!(text_width(&"x".repeat(25), 22), 396);
    }

    #[test]
    fn long_titles_shrink_and_truncate() {
        let name = "A".repeat(40);
        assert_eq!(title_font_size(&name), 52);
        // 760 / (52 * 0.72) = 20.3 → 19 characters and an ellipsis.
        let truncated = truncate_for_width(&name, 760, 52);
        assert_eq!(truncated.chars().count(), 20);
        assert!(truncated.ends_with('…'));
        assert_eq!(truncate_for_width("Short", 760, 72), "Short");
    }

    #[test]
    fn svg_draws_the_header() {
        let svg = preview().svg();
        assert!(svg.starts_with("<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1200\""));
        assert!(svg.contains(r#"<clipPath id="cardClip">"#));
        assert!(svg.contains(r#"href="/scryfall-assets/symbols/W.svg" x="866""#));
        assert!(svg.contains(r#"href="/scryfall-assets/symbols/UP.svg" x="920""#));
        assert!(svg.contains(r#"font-size="22" font-weight="750">Commander</text>"#));
        assert!(svg.contains(r##"<rect width="1200" height="630" fill="#211722" />"##));
        assert!(svg.contains(">60 cards</text>"));
        // No bracket: the card count follows the format badge.
        assert!(svg.contains(r#"<text x="283" y="111""#));
        let mut bracketed = preview();
        bracketed.bracket_label = Some("Bracket 3+".into());
        let svg = bracketed.svg();
        assert!(svg.contains(">Bracket 3+</text>"));
        assert!(svg.contains(&format!(
            r#"<text x="{}" y="111""#,
            116 + 187 + badge_width("Bracket 3+")
        )));
    }
}
