//! Reading downloaded Scryfall bulk files (`Manavault.Catalog.Scryfall.BulkData`).
//!
//! Bulk files are gzip-compressed JSON Lines and large (gigabytes once
//! inflated), so they are streamed from disk with lotus's [`JsonLines`] on a
//! blocking thread and never held in memory whole.

use std::fs::File;
use std::io::Read as _;
use std::path::{Path, PathBuf};

use lotus::scryfall::is_gzip;
use lotus::scryfall::{BulkError, JsonLines, ScryfallCard};
use serde::Deserialize;
use serde::de::{IgnoredAny, MapAccess, Visitor};
use serde_json::Value;
use tokio::sync::mpsc;

use crate::catalog::scryfall::import::{BATCH_SIZE, ImportError};

pub const NOT_GZIP: &str = "Scryfall bulk payload was not gzip-compressed JSON Lines";

/// The bulk-data metadata fields the sync reads. lotus's `BulkData`
/// requires a `type` field, which the sync has never needed, so a
/// metadata body without it is read here instead.
#[derive(Debug, Deserialize)]
pub struct BulkMetadata {
    #[serde(default)]
    jsonl_download_uri: Option<String>,
}

impl BulkMetadata {
    pub fn download_uri(&self) -> Result<&str, String> {
        self.jsonl_download_uri
            .as_deref()
            .filter(|uri| !uri.is_empty())
            .ok_or_else(|| BulkError::MissingDownloadUri.to_string())
    }
}

/// A JSON object whose contents are skipped: validating a record without
/// building it.
struct AnyObject;

impl<'de> Deserialize<'de> for AnyObject {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct ObjectVisitor;
        impl<'de> Visitor<'de> for ObjectVisitor {
            type Value = AnyObject;
            fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("a JSON object")
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<AnyObject, A::Error> {
                while map.next_entry::<IgnoredAny, IgnoredAny>()?.is_some() {}
                Ok(AnyObject)
            }
        }
        deserializer.deserialize_map(ObjectVisitor)
    }
}

fn open_gzip(path: &Path) -> Result<File, String> {
    let mut file = File::open(path).map_err(|error| BulkError::Io(error).to_string())?;
    let mut magic = [0_u8; 2];
    let read = file
        .read(&mut magic)
        .map_err(|error| BulkError::Io(error).to_string())?;
    if !is_gzip(magic.get(..read).unwrap_or_default()) {
        return Err(NOT_GZIP.to_owned());
    }
    File::open(path).map_err(|error| BulkError::Io(error).to_string())
}

/// Checks that every line is a JSON object and returns the record count,
/// before anything is imported (`BulkData.decode/1`'s validation pass).
pub async fn validate(path: PathBuf) -> Result<usize, String> {
    tokio::task::spawn_blocking(move || {
        let file = open_gzip(&path)?;
        let mut count = 0_usize;
        for record in JsonLines::<_, AnyObject>::gzip(file) {
            record.map_err(|error| error.to_string())?;
            count += 1;
        }
        Ok(count)
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Reads every record of a small bulk file (the oracle tags) into memory
/// (`BulkData.decode_list/1`).
pub async fn decode_list(path: PathBuf) -> Result<Vec<Value>, String> {
    tokio::task::spawn_blocking(move || {
        let file = open_gzip(&path)?;
        JsonLines::<_, serde_json::Map<String, Value>>::gzip(file)
            .map(|record| record.map(Value::Object).map_err(|error| error.to_string()))
            .collect()
    })
    .await
    .map_err(|error| error.to_string())?
}

/// Decodes one bulk record. lotus drops vocabulary it does not know (a new
/// rarity, finish, color, or legality, or an `all_parts` entry without an id)
/// instead of failing the card; a record that still fails (no `id` or
/// `name`) is skipped by the caller, as earlier releases skipped records
/// they could not build rows for.
pub fn decode_card(record: &Value) -> Result<ScryfallCard, serde_json::Error> {
    ScryfallCard::deserialize(record)
}

/// Streams the bulk file's paper printings in import batches. Records that
/// cannot be decoded as a card are skipped and counted; the count is the
/// final value sent on `skipped`.
pub fn paper_card_batches(
    path: PathBuf,
) -> (
    mpsc::Receiver<Result<Vec<ScryfallCard>, ImportError>>,
    tokio::sync::oneshot::Receiver<usize>,
) {
    let (sender, receiver) = mpsc::channel(2);
    let (skipped_sender, skipped) = tokio::sync::oneshot::channel();
    tokio::task::spawn_blocking(move || {
        let file = match open_gzip(&path) {
            Ok(file) => file,
            Err(error) => {
                let _ = sender.blocking_send(Err(ImportError::Decode(error)));
                return;
            }
        };
        let mut skipped_count = 0_usize;
        let mut batch = Vec::with_capacity(BATCH_SIZE);
        for record in JsonLines::<_, Value>::gzip(file) {
            let record = match record {
                Ok(record) => record,
                Err(error) => {
                    let _ = sender.blocking_send(Err(ImportError::Decode(error.to_string())));
                    return;
                }
            };
            match decode_card(&record) {
                Ok(card) if card.is_paper() => batch.push(card),
                Ok(_) => {}
                Err(error) => {
                    skipped_count += 1;
                    tracing::warn!(
                        "Scryfall catalog import skipped an undecodable record error={error}"
                    );
                }
            }
            if batch.len() >= BATCH_SIZE {
                let full = std::mem::replace(&mut batch, Vec::with_capacity(BATCH_SIZE));
                if sender.blocking_send(Ok(full)).is_err() {
                    return;
                }
            }
        }
        if !batch.is_empty() {
            let _ = sender.blocking_send(Ok(batch));
        }
        let _ = skipped_sender.send(skipped_count);
    });
    (receiver, skipped)
}

#[cfg(test)]
pub mod tests {
    use std::io::Write as _;

    use flate2::Compression;
    use flate2::write::GzEncoder;
    use serde_json::json;

    use super::*;

    /// Gzipped JSON Lines, one line per string.
    pub fn gzip_lines(lines: &[String]) -> Vec<u8> {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
        for line in lines {
            encoder.write_all(line.as_bytes()).unwrap();
            encoder.write_all(b"\n").unwrap();
        }
        encoder.finish().unwrap()
    }

    pub fn gzip_jsonl(records: &[Value]) -> Vec<u8> {
        gzip_lines(&records.iter().map(Value::to_string).collect::<Vec<_>>())
    }

    #[tokio::test]
    async fn validates_and_counts_large_payloads() {
        let dir = crate::test_support::TempDir::new();
        let records: Vec<Value> = (1..=3000)
            .map(|index| json!({"name": format!("Card {index}"), "digest": "x".repeat(64)}))
            .collect();
        let payload = gzip_jsonl(&records);
        assert!(payload.len() > 1000);
        let path = dir.path().join("bulk.jsonl.gz");
        std::fs::write(&path, &payload).unwrap();
        assert_eq!(validate(path.clone()).await, Ok(3000));

        let truncated = dir.path().join("truncated.jsonl.gz");
        let short = gzip_jsonl(&[json!({"name": "Incomplete"})]);
        std::fs::write(&truncated, &short[..short.len() - 8]).unwrap();
        let error = validate(truncated).await.unwrap_err();
        assert!(error.contains("decompress"), "{error}");

        let not_gzip = dir.path().join("plain.json");
        std::fs::write(&not_gzip, "[]").unwrap();
        assert_eq!(validate(not_gzip).await, Err(NOT_GZIP.to_owned()));

        let array = dir.path().join("array.jsonl.gz");
        std::fs::write(&array, gzip_lines(&["[1]".to_owned()])).unwrap();
        assert!(validate(array).await.is_err());
    }

    #[test]
    fn unknown_vocabulary_is_dropped_instead_of_losing_the_card() {
        let card = decode_card(&json!({
            "id": "p", "name": "n", "oracle_id": "o",
            "legalities": {"vintage": "legal", "newformat": "suspended"},
            "rarity": "ultra", "finishes": ["nonfoil", "glossy"], "colors": ["U", "P"],
            "all_parts": [{"component": "token", "name": "No id"}, {"id": "t", "component": "token"}]
        }))
        .unwrap();
        assert_eq!(card.legalities.len(), 1);
        assert_eq!(card.rarity, None);
        assert_eq!(card.finishes, vec![lotus::Finish::Nonfoil]);
        assert_eq!(card.colors, Some(vec![lotus::Color::U]));
        assert_eq!(card.all_parts.len(), 1);
        assert!(decode_card(&json!({"name": "no id"})).is_err());
    }

    #[test]
    fn metadata_requires_a_jsonl_uri() {
        let metadata: BulkMetadata =
            serde_json::from_value(json!({"download_uri": "https://x/default-cards.json"}))
                .unwrap();
        assert_eq!(
            metadata.download_uri(),
            Err("Scryfall bulk metadata did not include jsonl_download_uri".to_owned())
        );
    }
}
