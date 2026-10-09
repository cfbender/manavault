//! Daily price history from MTGJSON, used to rebuild the market price items
//! had when they entered the collection.
//!
//! MTGJSON publishes `AllPrices.json.gz`, about three months of daily
//! retail and buylist prices per card from `TCGplayer`, Card Kingdom, Mana
//! Pool, and Cardmarket, keyed by MTGJSON uuid, and `cardIdentifiers.csv`,
//! which maps uuids to Scryfall ids. Both files are large, so they are
//! streamed and only the cards asked for are kept.

use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::File;
use std::io::{BufReader, Read as _};
use std::path::{Path, PathBuf};

use lotus::scryfall::ScryfallError;
use serde::de::{DeserializeSeed, Deserializer, IgnoredAny, MapAccess, Visitor};
use serde_json::Value;
use time::Date;
use time::macros::format_description;

use crate::catalog::price::finish_fallbacks;
use crate::catalog::scryfall::sync::client;
use crate::pricing::money;
use crate::pricing::{PriceSource, Vendor};
use manavault_core::state::AppState;

/// Where the history files are fetched from; tests point them elsewhere.
#[derive(Debug, Clone)]
pub struct HistoryUrls {
    pub all_prices: String,
    pub card_identifiers: String,
}

impl Default for HistoryUrls {
    fn default() -> Self {
        Self {
            all_prices: "https://mtgjson.com/api/v5/AllPrices.json.gz".to_owned(),
            card_identifiers: "https://mtgjson.com/api/v5/csv/cardIdentifiers.csv".to_owned(),
        }
    }
}

/// Daily prices in cents of one finish from one provider.
type Series = BTreeMap<Date, i64>;

/// `(provider, MTGJSON finish)`: `tcgplayer`/`cardkingdom`/`manapool`
/// and `normal`/`foil`/`etched`.
type SeriesKey = (String, String);

/// USD retail price history by Scryfall id.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct PriceHistory {
    cards: HashMap<String, HashMap<SeriesKey, Series>>,
}

/// The provider whose history stands in for a price source. Scryfall's USD
/// prices come from `TCGplayer`, so its history is `TCGplayer`'s.
fn provider(source: PriceSource) -> &'static str {
    match source {
        PriceSource::Scryfall | PriceSource::Vendor(Vendor::TcgPlayer) => "tcgplayer",
        PriceSource::Vendor(vendor) => vendor.as_str(),
    }
}

/// MTGJSON's name for a collection finish.
fn mtgjson_finish(finish: &str) -> &str {
    match finish {
        "nonfoil" => "normal",
        other => other,
    }
}

impl PriceHistory {
    /// The first and last day with any price.
    #[must_use]
    pub fn range(&self) -> Option<(Date, Date)> {
        let mut range: Option<(Date, Date)> = None;
        for series in self.cards.values().flat_map(HashMap::values) {
            let (Some((first, _)), Some((last, _))) =
                (series.first_key_value(), series.last_key_value())
            else {
                continue;
            };
            range = Some(match range {
                None => (*first, *last),
                Some((from, to)) => (from.min(*first), to.max(*last)),
            });
        }
        range
    }

    /// The price of one copy on `on`: the source's provider, the first
    /// finish in the fallback chain with any history, and that finish's
    /// price on the latest day up to `on`, else its earliest later day.
    #[must_use]
    pub fn price_cents(
        &self,
        scryfall_id: &str,
        source: PriceSource,
        finish: Option<&str>,
        on: Date,
    ) -> Option<i64> {
        let card = self.cards.get(scryfall_id)?;
        let provider = provider(source);
        finish_fallbacks(finish).iter().find_map(|finish| {
            let series = card.get(&(provider.to_owned(), mtgjson_finish(finish).to_owned()))?;
            series
                .range(..=on)
                .next_back()
                .or_else(|| series.range(on..).next())
                .map(|(_, cents)| *cents)
        })
    }

    fn insert(&mut self, scryfall_id: &str, card: CardPrices) {
        let entry = self.cards.entry(scryfall_id.to_owned()).or_default();
        for (key, series) in card {
            entry.entry(key).or_default().extend(series);
        }
    }
}

/// Removes the downloaded file when dropped.
struct Download(PathBuf);

impl Drop for Download {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

async fn download(state: &AppState, url: &str, dir: &Path, name: &str) -> Result<Download, String> {
    tokio::fs::create_dir_all(dir)
        .await
        .map_err(|error| error.to_string())?;
    let path = dir.join(name);
    let file = Download(path.clone());
    let bytes = client(state)
        .download_to_file(url, &path)
        .await
        .map_err(|error| format_fetch_error(&error))?;
    tracing::info!("Acquisition price rebuild downloaded MTGJSON {name} bytes={bytes}");
    Ok(file)
}

/// Error text for a failed download, naming MTGJSON rather than Scryfall.
fn format_fetch_error(error: &ScryfallError) -> String {
    match error {
        ScryfallError::NotFound => "MTGJSON request failed with HTTP 404".to_owned(),
        ScryfallError::Status(status) => {
            format!("MTGJSON request failed with HTTP {}", status.as_u16())
        }
        ScryfallError::Transport(error) => format!("MTGJSON request failed: {error}"),
        ScryfallError::Decode(error) => format!("MTGJSON returned an unreadable response: {error}"),
        ScryfallError::Io(error) => format!("could not write MTGJSON download: {error}"),
    }
}

/// Downloads MTGJSON's identifiers and price history and keeps the USD
/// retail history of `scryfall_ids`. Nothing is fetched for no ids.
pub async fn fetch(
    state: &AppState,
    urls: &HistoryUrls,
    scryfall_ids: &[String],
) -> Result<PriceHistory, String> {
    if scryfall_ids.is_empty() {
        return Ok(PriceHistory::default());
    }
    let dir = state.config.data_dir.join("cache/mtgjson");
    let identifiers = download(state, &urls.card_identifiers, &dir, "cardIdentifiers.csv").await?;
    let wanted: HashSet<String> = scryfall_ids.iter().cloned().collect();
    let uuids = tokio::task::spawn_blocking(move || {
        let file = File::open(&identifiers.0).map_err(|error| error.to_string())?;
        decode_identifiers(BufReader::new(file), &wanted)
    })
    .await
    .map_err(|error| error.to_string())??;
    if uuids.is_empty() {
        return Ok(PriceHistory::default());
    }
    let prices = download(state, &urls.all_prices, &dir, "AllPrices.json.gz").await?;
    tokio::task::spawn_blocking(move || {
        let mut file = File::open(&prices.0).map_err(|error| error.to_string())?;
        let mut magic = [0_u8; 2];
        let read = file.read(&mut magic).map_err(|error| error.to_string())?;
        if !lotus::scryfall::is_gzip(magic.get(..read).unwrap_or_default()) {
            return Err("MTGJSON AllPrices payload was not gzip-compressed JSON".to_owned());
        }
        let file = File::open(&prices.0).map_err(|error| error.to_string())?;
        decode_prices(flate2::read::GzDecoder::new(BufReader::new(file)), &uuids)
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Reads `cardIdentifiers.csv` into `uuid → Scryfall id` for the wanted
/// Scryfall ids.
fn decode_identifiers(
    reader: impl std::io::Read,
    wanted: &HashSet<String>,
) -> Result<HashMap<String, String>, String> {
    let mut csv = csv::Reader::from_reader(reader);
    let headers = csv
        .headers()
        .map_err(|error| format!("Could not read MTGJSON card identifiers: {error}"))?;
    let column = |name: &str| {
        headers
            .iter()
            .position(|header| header == name)
            .ok_or_else(|| format!("MTGJSON card identifiers had no {name} column"))
    };
    let (uuid, scryfall_id) = (column("uuid")?, column("scryfallId")?);
    let mut uuids = HashMap::new();
    for record in csv.records() {
        let record =
            record.map_err(|error| format!("Could not read MTGJSON card identifiers: {error}"))?;
        let (Some(uuid), Some(scryfall_id)) = (record.get(uuid), record.get(scryfall_id)) else {
            continue;
        };
        if wanted.contains(scryfall_id) {
            uuids.insert(uuid.to_owned(), scryfall_id.to_owned());
        }
    }
    Ok(uuids)
}

/// Streams `AllPrices.json` keeping only the wanted uuids.
fn decode_prices(
    reader: impl std::io::Read,
    uuids: &HashMap<String, String>,
) -> Result<PriceHistory, String> {
    let mut deserializer = serde_json::Deserializer::from_reader(BufReader::new(reader));
    let cards = DocumentSeed { uuids }
        .deserialize(&mut deserializer)
        .map_err(|error| describe(&error))?;
    deserializer.end().map_err(|error| describe(&error))?;
    let mut history = PriceHistory::default();
    for (uuid, card) in cards {
        if let Some(scryfall_id) = uuids.get(&uuid) {
            history.insert(scryfall_id, card);
        }
    }
    Ok(history)
}

fn describe(error: &serde_json::Error) -> String {
    if error.is_io() {
        format!("Could not decompress MTGJSON AllPrices payload: {error}")
    } else if error.is_eof() && error.line() == 1 && error.column() == 0 {
        "MTGJSON AllPrices payload was empty".to_owned()
    } else {
        format!("Could not decode MTGJSON price history: {error}")
    }
}

/// One card's USD retail series by `(provider, finish)`.
type CardPrices = HashMap<SeriesKey, Series>;

/// Keeps `paper.<provider>.retail.<finish>` of a card's price object when
/// its currency is USD.
fn card_prices(value: &Value) -> CardPrices {
    let format = format_description!("[year]-[month]-[day]");
    let mut prices = CardPrices::new();
    let Some(paper) = value.get("paper").and_then(Value::as_object) else {
        return prices;
    };
    for (provider, provider_prices) in paper {
        if provider_prices.get("currency").and_then(Value::as_str) != Some("USD") {
            continue;
        }
        let Some(retail) = provider_prices.get("retail").and_then(Value::as_object) else {
            continue;
        };
        for (finish, days) in retail {
            let Some(days) = days.as_object() else {
                continue;
            };
            let series: Series = days
                .iter()
                .filter_map(|(day, price)| {
                    Some((Date::parse(day, &format).ok()?, money::to_cents(price)?))
                })
                .collect();
            if !series.is_empty() {
                prices.insert((provider.clone(), finish.clone()), series);
            }
        }
    }
    prices
}

/// The document: `meta` is skipped and `data` is walked with [`DataSeed`].
struct DocumentSeed<'a> {
    uuids: &'a HashMap<String, String>,
}

impl<'de> DeserializeSeed<'de> for DocumentSeed<'_> {
    type Value = HashMap<String, CardPrices>;

    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<Self::Value, D::Error> {
        deserializer.deserialize_map(self)
    }
}

impl<'de> Visitor<'de> for DocumentSeed<'_> {
    type Value = HashMap<String, CardPrices>;

    fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("an MTGJSON AllPrices document")
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        let mut cards = None;
        while let Some(key) = map.next_key::<String>()? {
            if key == "data" {
                cards = Some(map.next_value_seed(DataSeed { uuids: self.uuids })?);
            } else {
                map.next_value::<IgnoredAny>()?;
            }
        }
        cards.ok_or_else(|| serde::de::Error::missing_field("data"))
    }
}

/// `data`: every card keyed by uuid; unwanted cards are skipped unparsed.
struct DataSeed<'a> {
    uuids: &'a HashMap<String, String>,
}

impl<'de> DeserializeSeed<'de> for DataSeed<'_> {
    type Value = HashMap<String, CardPrices>;

    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<Self::Value, D::Error> {
        deserializer.deserialize_map(self)
    }
}

impl<'de> Visitor<'de> for DataSeed<'_> {
    type Value = HashMap<String, CardPrices>;

    fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("MTGJSON prices by uuid")
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        let mut cards = HashMap::new();
        while let Some(uuid) = map.next_key::<String>()? {
            if self.uuids.contains_key(&uuid) {
                let value: Value = map.next_value()?;
                cards.insert(uuid, card_prices(&value));
            } else {
                map.next_value::<IgnoredAny>()?;
            }
        }
        Ok(cards)
    }
}

#[cfg(test)]
mod tests {
    use pretty_assertions::assert_eq;
    use serde_json::json;
    use time::macros::date;

    use super::*;

    fn uuids() -> HashMap<String, String> {
        HashMap::from([
            ("uuid-1".to_owned(), "scryfall-1".to_owned()),
            ("uuid-1b".to_owned(), "scryfall-1".to_owned()),
            ("uuid-2".to_owned(), "scryfall-2".to_owned()),
        ])
    }

    fn history() -> PriceHistory {
        let document = json!({
            "meta": {"date": "2026-10-08", "version": "5.2.2+20261008"},
            "data": {
                "uuid-1": {
                    "mtgo": {"cardhoarder": {"currency": "USD", "retail": {"normal": {"2026-10-01": 99}}}},
                    "paper": {
                        "tcgplayer": {
                            "currency": "USD",
                            "buylist": {"normal": {"2026-10-01": 0.05}},
                            "retail": {
                                "normal": {"2026-10-01": 1.5, "2026-10-03": 1.75, "2026-10-07": 2},
                                "foil": {"2026-10-05": 4.25}
                            }
                        },
                        "cardkingdom": {
                            "currency": "USD",
                            "retail": {"normal": {"2026-10-02": 1.99}}
                        },
                        "cardmarket": {
                            "currency": "EUR",
                            "retail": {"normal": {"2026-10-02": 1.2}}
                        }
                    }
                },
                "uuid-1b": {
                    "paper": {"tcgplayer": {"currency": "USD", "retail": {"etched": {"2026-10-04": 9}}}}
                },
                "uuid-2": {
                    "paper": {"manapool": {"currency": "USD", "retail": {"normal": {"2026-09-20": 0.1}}}}
                },
                "uuid-unwanted": {
                    "paper": {"tcgplayer": {"currency": "USD", "retail": {"normal": {"2026-10-01": 500}}}}
                }
            }
        });
        decode_prices(document.to_string().as_bytes(), &uuids()).unwrap()
    }

    #[test]
    fn keeps_usd_paper_retail_prices_of_wanted_cards() {
        let history = history();
        assert_eq!(history.cards.len(), 2);
        assert_eq!(
            history.range(),
            Some((date!(2026 - 09 - 20), date!(2026 - 10 - 07)))
        );
        let scryfall = PriceSource::Scryfall;
        // The latest day up to the asked-for one, from the uuid that has it.
        assert_eq!(
            history.price_cents(
                "scryfall-1",
                scryfall,
                Some("nonfoil"),
                date!(2026 - 10 - 04)
            ),
            Some(175)
        );
        assert_eq!(
            history.price_cents(
                "scryfall-1",
                scryfall,
                Some("nonfoil"),
                date!(2026 - 10 - 03)
            ),
            Some(175)
        );
        assert_eq!(
            history.price_cents(
                "scryfall-1",
                scryfall,
                Some("nonfoil"),
                date!(2026 - 10 - 09)
            ),
            Some(200)
        );
        // Before the first day, the earliest later one.
        assert_eq!(
            history.price_cents("scryfall-1", scryfall, Some("foil"), date!(2026 - 10 - 01)),
            Some(425)
        );
        assert_eq!(
            history.price_cents(
                "scryfall-1",
                scryfall,
                Some("etched"),
                date!(2026 - 10 - 06)
            ),
            Some(900)
        );
        // Vendors map to their own provider; Cardmarket's EUR prices and the
        // buylist are skipped, so a vendor without a series falls through.
        assert_eq!(
            history.price_cents(
                "scryfall-1",
                PriceSource::Vendor(Vendor::CardKingdom),
                Some("nonfoil"),
                date!(2026 - 10 - 04)
            ),
            Some(199)
        );
        assert_eq!(
            history.price_cents(
                "scryfall-1",
                PriceSource::Vendor(Vendor::ManaPool),
                Some("nonfoil"),
                date!(2026 - 10 - 04)
            ),
            None
        );
        assert_eq!(
            history.price_cents(
                "scryfall-2",
                PriceSource::Vendor(Vendor::ManaPool),
                None,
                date!(2026 - 10 - 04)
            ),
            Some(10)
        );
        assert_eq!(
            history.price_cents("scryfall-2", scryfall, None, date!(2026 - 10 - 04)),
            None
        );
        assert_eq!(
            history.price_cents("missing", scryfall, None, date!(2026 - 10 - 04)),
            None
        );
    }

    #[test]
    fn falls_back_across_finishes_in_order() {
        let history = history();
        // A nonfoil item of a card with only foil history takes the foil price.
        let document = json!({"data": {"uuid-2": {"paper": {"tcgplayer": {
            "currency": "USD",
            "retail": {"foil": {"2026-10-01": 3}, "etched": {"2026-10-01": 7}}
        }}}}});
        let foil_only = decode_prices(document.to_string().as_bytes(), &uuids()).unwrap();
        assert_eq!(
            foil_only.price_cents(
                "scryfall-2",
                PriceSource::Scryfall,
                Some("nonfoil"),
                date!(2026 - 10 - 02)
            ),
            Some(300)
        );
        assert_eq!(
            foil_only.price_cents(
                "scryfall-2",
                PriceSource::Scryfall,
                Some("etched"),
                date!(2026 - 10 - 02)
            ),
            Some(700)
        );
        assert_eq!(
            history.range().map(|(from, _)| from),
            Some(date!(2026 - 09 - 20))
        );
    }

    #[test]
    fn rejects_documents_without_data() {
        assert_eq!(
            decode_prices(&b"{\"meta\":{}}"[..], &uuids()),
            Err(
                "Could not decode MTGJSON price history: missing field `data` at line 1 column 11"
                    .to_owned()
            )
        );
        assert_eq!(
            decode_prices(&b""[..], &uuids()),
            Err("MTGJSON AllPrices payload was empty".to_owned())
        );
        assert_eq!(PriceHistory::default().range(), None);
    }

    #[test]
    fn maps_identifiers_to_wanted_scryfall_ids() {
        let csv = "cardKingdomId,scryfallId,uuid\n1,scryfall-1,uuid-1\n2,scryfall-1,uuid-1b\n3,other,uuid-3\n4,,uuid-4\n";
        let wanted = HashSet::from(["scryfall-1".to_owned()]);
        assert_eq!(
            decode_identifiers(csv.as_bytes(), &wanted).unwrap(),
            HashMap::from([
                ("uuid-1".to_owned(), "scryfall-1".to_owned()),
                ("uuid-1b".to_owned(), "scryfall-1".to_owned()),
            ])
        );
        assert_eq!(
            decode_identifiers(&b"cardKingdomId,uuid\n1,uuid-1\n"[..], &wanted),
            Err("MTGJSON card identifiers had no scryfallId column".to_owned())
        );
    }
}
