//! EDHREC saltiness scores from MTGJSON's `AtomicCards`
//! (`Manavault.Catalog.Mtgjson.Saltiness`).
//!
//! `AtomicCards.json.gz` is hundreds of megabytes once inflated, so it is
//! walked with a streaming serde visitor that keeps only
//! `(scryfallOracleId, edhrecSaltiness)` pairs, never the document.

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufReader, Read as _};
use std::path::PathBuf;

use serde::Deserialize;
use serde::de::{Deserializer, MapAccess, SeqAccess, Visitor};
use serde_json::Value;
use sqlx::SqlitePool;

use super::{Metric, MetricValue, UPDATE_BATCH_SIZE, clear_stale, update_batch};

/// MTGJSON's atomic card file.
pub const SALTINESS_URL: &str = "https://mtgjson.com/api/v5/AtomicCards.json.gz";

/// Scores by oracle id.
pub type Scores = HashMap<String, f64>;

/// What a JSON value contributes, mirroring the Elixir `:json` decoders: a
/// card object with an oracle id and a numeric score yields a score; an
/// object with only an oracle id (MTGJSON's `identifiers`) passes the id up
/// to its parent; arrays and other objects pass up the scores found inside.
enum Node {
    Scores(Vec<(String, f64)>),
    OracleId(String, Vec<(String, f64)>),
    Other,
}

impl<'de> Deserialize<'de> for Node {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(NodeVisitor)
    }
}

struct NodeVisitor;

impl<'de> Visitor<'de> for NodeVisitor {
    type Value = Node;

    fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("JSON")
    }

    fn visit_bool<E>(self, _: bool) -> Result<Node, E> {
        Ok(Node::Other)
    }
    fn visit_i64<E>(self, _: i64) -> Result<Node, E> {
        Ok(Node::Other)
    }
    fn visit_u64<E>(self, _: u64) -> Result<Node, E> {
        Ok(Node::Other)
    }
    fn visit_f64<E>(self, _: f64) -> Result<Node, E> {
        Ok(Node::Other)
    }
    fn visit_str<E>(self, _: &str) -> Result<Node, E> {
        Ok(Node::Other)
    }
    fn visit_unit<E>(self) -> Result<Node, E> {
        Ok(Node::Other)
    }
    fn visit_none<E>(self) -> Result<Node, E> {
        Ok(Node::Other)
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut seq: A) -> Result<Node, A::Error> {
        let mut scores = Vec::new();
        while let Some(node) = seq.next_element::<Node>()? {
            if let Node::Scores(found) = node {
                scores.extend(found);
            }
        }
        Ok(Node::Scores(scores))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Node, A::Error> {
        let mut oracle_id: Option<String> = None;
        let mut score: Option<f64> = None;
        let mut scores = Vec::new();
        while let Some(key) = map.next_key::<String>()? {
            match key.as_str() {
                "scryfallOracleId" | "edhrecSaltiness" => {
                    let value: Value = map.next_value()?;
                    match (key.as_str(), value) {
                        ("scryfallOracleId", Value::String(id)) => oracle_id = Some(id),
                        ("edhrecSaltiness", Value::Number(number)) => score = number.as_f64(),
                        _ => {}
                    }
                }
                _ => match map.next_value::<Node>()? {
                    Node::OracleId(id, found) => {
                        if key == "identifiers" {
                            oracle_id = Some(id);
                        }
                        scores.extend(found);
                    }
                    Node::Scores(found) => scores.extend(found),
                    Node::Other => {}
                },
            }
        }
        Ok(match (oracle_id, score) {
            (Some(id), Some(score)) => {
                scores.insert(0, (id, score));
                Node::Scores(scores)
            }
            (Some(id), None) => Node::OracleId(id, scores),
            (None, _) => Node::Scores(scores),
        })
    }
}

/// Whether `Deserializer::end` failed because data follows the document.
fn trailing_data(error: &serde_json::Error) -> bool {
    error.to_string().contains("trailing characters")
}

/// Decodes a downloaded `AtomicCards.json.gz` into scores by oracle id.
/// Cards with a `null` score are absent, so the refresh clears them.
pub async fn decode_file(path: PathBuf) -> Result<Scores, String> {
    tokio::task::spawn_blocking(move || {
        let mut file = File::open(&path).map_err(|error| error.to_string())?;
        let mut magic = [0_u8; 2];
        let read = file.read(&mut magic).map_err(|error| error.to_string())?;
        if !lotus::scryfall::is_gzip(magic.get(..read).unwrap_or_default()) {
            return Err("MTGJSON AtomicCards payload was not gzip-compressed JSON".to_owned());
        }
        let file = File::open(&path).map_err(|error| error.to_string())?;
        decode_reader(flate2::read::GzDecoder::new(BufReader::new(file)))
    })
    .await
    .map_err(|error| error.to_string())?
}

fn decode_reader(reader: impl std::io::Read) -> Result<Scores, String> {
    let mut deserializer = serde_json::Deserializer::from_reader(BufReader::new(reader));
    let node = Node::deserialize(&mut deserializer).map_err(|error| describe(&error))?;
    deserializer.end().map_err(|error| {
        if trailing_data(&error) {
            "MTGJSON AtomicCards payload included data after the JSON document".to_owned()
        } else {
            describe(&error)
        }
    })?;
    match node {
        Node::Scores(scores) => Ok(scores.into_iter().collect()),
        Node::OracleId(..) | Node::Other => {
            Err("MTGJSON AtomicCards payload had no card data".to_owned())
        }
    }
}

fn describe(error: &serde_json::Error) -> String {
    if error.is_io() {
        format!("Could not decompress MTGJSON AtomicCards payload: {error}")
    } else if error.is_eof() && error.line() == 1 && error.column() == 0 {
        "MTGJSON AtomicCards payload was empty".to_owned()
    } else {
        format!("Could not decode MTGJSON saltiness data: {error}")
    }
}

/// Stores scores and clears every other card's score. Returns the number of
/// scores supplied, matched or not.
pub async fn update_cards(pool: &SqlitePool, scores: &Scores) -> Result<usize, sqlx::Error> {
    let entries: Vec<(String, MetricValue)> = scores
        .iter()
        .map(|(id, score)| (id.clone(), MetricValue::Real(*score)))
        .collect();
    for batch in entries.chunks(UPDATE_BATCH_SIZE) {
        update_batch(pool, Metric::Saltiness, batch).await?;
    }
    let keep: HashSet<String> = scores.keys().cloned().collect();
    clear_stale(pool, Metric::Saltiness, &keep).await?;
    Ok(scores.len())
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn decode(value: &Value) -> Result<Scores, String> {
        decode_reader(value.to_string().as_bytes())
    }

    #[test]
    fn keeps_numeric_scores_by_scryfall_oracle_id() {
        let scores = decode(&json!({
            "meta": {"date": "2026-08-13"},
            "data": {
                "Black Lotus": [{"edhrecSaltiness": 1.25, "identifiers": {"scryfallOracleId": "oracle-1"}}],
                "Unscored": [{"edhrecSaltiness": null, "identifiers": {"scryfallOracleId": "oracle-2"}}],
                "Integer": [{"edhrecSaltiness": 2, "identifiers": {"scryfallOracleId": "oracle-3", "other": "x"}}],
                "No id": [{"edhrecSaltiness": 3.0, "identifiers": {}}]
            }
        }))
        .unwrap();
        assert_eq!(
            scores,
            HashMap::from([("oracle-1".to_owned(), 1.25), ("oracle-3".to_owned(), 2.0)])
        );
    }

    #[test]
    fn rejects_trailing_data_and_non_documents() {
        assert_eq!(
            decode_reader(&b"{\"data\":{}} extra"[..]),
            Err("MTGJSON AtomicCards payload included data after the JSON document".to_owned())
        );
        assert_eq!(
            decode_reader(&b"\"text\""[..]),
            Err("MTGJSON AtomicCards payload had no card data".to_owned())
        );
        assert_eq!(
            decode_reader(&b""[..]),
            Err("MTGJSON AtomicCards payload was empty".to_owned())
        );
    }
}
