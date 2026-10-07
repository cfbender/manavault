//! Labelled scanner frames for training card recognition
//! (`Manavault.Scanner.Corrections`), in the layout Oracle's
//! `cardid.corrections pull` imports:
//!
//! ```text
//! DATA_DIR/scanner/corrections/labels.jsonl        append-only; the last row per capture wins
//! DATA_DIR/scanner/corrections/<capture_id>/crop.jpg
//! DATA_DIR/scanner/corrections/<capture_id>/label.json
//! ```
//!
//! A relabel may omit the image once the capture exists; the first image is
//! never overwritten. A `null` label marks the capture skipped. Writes are
//! serialized and identical resubmissions are not appended again.

use std::path::{Path, PathBuf};

use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use serde_json::{Map, Value, json};
use sha1::{Digest, Sha1};
use tokio::io::AsyncWriteExt as _;

const FIELDS: [&str; 11] = [
    "capture_id",
    "label",
    "click",
    "quad",
    "quad_source",
    "up_vote",
    "bundle_version",
    "top1",
    "similarity",
    "margin",
    "finish",
];
const FINISHES: [&str; 3] = ["nonfoil", "foil", "etched"];
const QUAD_SOURCES: [&str; 2] = ["detector", "manual"];
const MAX_IMAGE: usize = 190_000;
const PAGE_SIZE: usize = 50;

static WRITE_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// The corrections directory under the scanner bundle directory.
#[must_use]
pub fn directory(bundle_dir: &Path) -> PathBuf {
    bundle_dir.join("corrections")
}

fn uuid(value: &str) -> bool {
    let groups: Vec<&str> = value.split('-').collect();
    groups.len() == 5
        && groups.iter().zip([8, 4, 4, 4, 12]).all(|(group, len)| {
            group.len() == len && group.chars().all(|c| matches!(c, '0'..='9' | 'a'..='f'))
        })
}

fn uuid_value(value: Option<&Value>) -> bool {
    value.and_then(Value::as_str).is_some_and(uuid)
}

/// A gallery printing id: a UUID, optionally with the face suffix `-1`.
fn printing_id(value: &Value) -> bool {
    value.as_str().is_some_and(|id| {
        uuid(
            id.strip_suffix("-1")
                .filter(|base| uuid(base))
                .unwrap_or(id),
        )
    })
}

fn number_in(value: &Value, low: f64, high: f64) -> bool {
    value.as_f64().is_some_and(|n| n >= low && n <= high)
}

fn optional_number(value: Option<&Value>, low: f64, high: f64) -> bool {
    match value {
        None | Some(Value::Null) => true,
        Some(value) => number_in(value, low, high),
    }
}

fn point(value: &Value, low: f64, high: f64) -> bool {
    matches!(value.as_array().map(Vec::as_slice), Some([x, y]) if number_in(x, low, high) && number_in(y, low, high))
}

fn present(value: Option<&Value>) -> Option<&Value> {
    value.filter(|value| !value.is_null())
}

fn validate_fields(p: &Map<String, Value>) -> bool {
    let quad = present(p.get("quad"));
    let quad_ok = quad.is_none_or(|quad| {
        quad.as_array().is_some_and(|points| {
            points.len() == 4 && points.iter().all(|pt| point(pt, -2048.0, 2048.0))
        })
    });
    let quad_source_ok = match present(p.get("quad_source")) {
        None => true,
        Some(Value::String(source)) if source == "manual" && quad.is_none() => false,
        Some(Value::String(source)) => QUAD_SOURCES.contains(&source.as_str()),
        Some(_) => false,
    };
    uuid_value(p.get("capture_id"))
        && present(p.get("label")).is_none_or(printing_id)
        && p.get("click").is_some_and(|click| point(click, 0.0, 640.0))
        && quad_ok
        && quad_source_ok
        && optional_number(p.get("up_vote"), 0.0, 2.0)
        && optional_number(p.get("similarity"), -2.0, 2.0)
        && optional_number(p.get("margin"), 0.0, 4.0)
        && present(p.get("top1")).is_none_or(printing_id)
        && present(p.get("finish"))
            .is_none_or(|finish| finish.as_str().is_some_and(|f| FINISHES.contains(&f)))
        && p.get("bundle_version")
            .and_then(Value::as_str)
            .is_some_and(|version| version.len() <= 120)
}

/// Baseline or progressive JPEG frame dimensions, without decoding pixels.
fn jpeg_size(mut data: &[u8]) -> Option<(u16, u16)> {
    loop {
        let [0xFF, marker, len_hi, len_lo, rest @ ..] = data else {
            return None;
        };
        if matches!(marker, 0xC0 | 0xC2)
            && let [8, h_hi, h_lo, w_hi, w_lo, ..] = rest
        {
            return Some((
                u16::from_be_bytes([*w_hi, *w_lo]),
                u16::from_be_bytes([*h_hi, *h_lo]),
            ));
        }
        let length = usize::from(u16::from_be_bytes([*len_hi, *len_lo]));
        if matches!(marker, 0xD8..=0xDA) || length < 2 || rest.len() < length - 2 {
            return None;
        }
        data = rest.get(length - 2..)?;
    }
}

enum Image {
    New(Vec<u8>),
    Existing,
}

fn image(dir: &Path, p: &Map<String, Value>) -> Option<Image> {
    let capture_id = p.get("capture_id").and_then(Value::as_str)?;
    let Some(image) = p.get("image") else {
        return dir
            .join(capture_id)
            .join("crop.jpg")
            .is_file()
            .then_some(Image::Existing);
    };
    let encoded = image.as_str()?.strip_prefix("data:image/jpeg;base64,")?;
    if encoded.len() > MAX_IMAGE {
        return None;
    }
    let jpeg = STANDARD.decode(encoded).ok()?;
    let rest = jpeg.strip_prefix(&[0xFF, 0xD8])?;
    if !jpeg.ends_with(&[0xFF, 0xD9]) {
        return None;
    }
    let (width, height) = jpeg_size(rest)?;
    let [x, y] = p.get("click")?.as_array()?.as_slice() else {
        return None;
    };
    let (x, y) = (x.as_f64()?, y.as_f64()?);
    ((1..=640).contains(&width)
        && (1..=640).contains(&height)
        && x <= f64::from(width)
        && y <= f64::from(height))
    .then_some(Image::New(jpeg))
}

/// Oracle's deterministic held-out split: SHA-1 of the id as a big-endian
/// integer, `eval` when divisible by five.
#[must_use]
pub fn split_for(id: &str) -> &'static str {
    let remainder = Sha1::digest(id.as_bytes())
        .iter()
        .fold(0_u32, |acc, byte| (acc * 256 + u32::from(*byte)) % 5);
    if remainder == 0 { "eval" } else { "train" }
}

/// Saves a correction; `None` for an invalid one.
pub async fn save(bundle_dir: &Path, params: &Value) -> std::io::Result<Option<String>> {
    let Some(p) = params.as_object() else {
        return Ok(None);
    };
    let dir = directory(bundle_dir);
    if !validate_fields(p) {
        return Ok(None);
    }
    let Some(image) = image(&dir, p) else {
        return Ok(None);
    };
    let _guard = WRITE_LOCK.lock().await;
    let id = p
        .get("capture_id")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_owned();
    let mut row: Map<String, Value> = FIELDS
        .iter()
        .filter_map(|field| {
            let value = p.get(*field)?;
            (!value.is_null() || *field == "label").then(|| ((*field).to_owned(), value.clone()))
        })
        .collect();
    row.entry("label").or_insert(Value::Null);
    row.insert("split".to_owned(), json!(split_for(&id)));
    row.insert("source".to_owned(), json!("manavault-scanner"));
    let encoded = Value::Object(row).to_string();

    let capture_dir = dir.join(&id);
    let latest = capture_dir.join("label.json");
    if tokio::fs::read_to_string(&latest).await.ok().as_deref() != Some(encoded.as_str()) {
        tokio::fs::create_dir_all(&capture_dir).await?;
        let crop = capture_dir.join("crop.jpg");
        if let Image::New(jpeg) = &image
            && !crop.exists()
        {
            tokio::fs::write(&crop, jpeg).await?;
        }
        let mut labels = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(dir.join("labels.jsonl"))
            .await?;
        labels.write_all(format!("{encoded}\n").as_bytes()).await?;
        tokio::fs::write(&latest, &encoded).await?;
    }
    Ok(Some(id))
}

/// A page of label rows from `cursor`.
pub async fn page(bundle_dir: &Path, cursor: usize) -> std::io::Result<Value> {
    let path = directory(bundle_dir).join("labels.jsonl");
    let contents = match tokio::fs::read_to_string(&path).await {
        Ok(contents) => contents,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error),
    };
    let rows: Vec<Value> = contents
        .lines()
        .skip(cursor)
        .take(PAGE_SIZE)
        .filter_map(|line| serde_json::from_str(line).ok())
        .collect();
    let count = rows.len();
    Ok(json!({
        "corrections": rows,
        "cursor": cursor + count,
        "has_more": count == PAGE_SIZE
    }))
}

/// A capture's crop image.
#[must_use]
pub fn crop_path(bundle_dir: &Path, id: &str) -> Option<PathBuf> {
    let path = directory(bundle_dir).join(id).join("crop.jpg");
    (uuid(id) && path.is_file()).then_some(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_ids_and_splits_deterministically() {
        assert!(uuid("11111111-2222-4333-8444-555555555555"));
        assert!(!uuid("11111111-2222-4333-8444-55555555555G"));
        assert!(printing_id(&json!(
            "54772e15-d99d-4eec-ba8d-b9202a7e318b-1"
        )));
        assert!(!printing_id(&json!(
            "54772e15-d99d-4eec-ba8d-b9202a7e318b-2"
        )));
        // Elixir: rem(:binary.decode_unsigned(:crypto.hash(:sha, id)), 5).
        assert_eq!(split_for("11111111-2222-4333-8444-555555555555"), "train");
        assert_eq!(split_for("b"), "eval");
        assert_eq!(split_for("a"), "train");
    }

    #[test]
    fn reads_jpeg_frame_sizes() {
        let jpeg = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/tests/fixtures/scanner-frame.jpg"
        ))
        .unwrap();
        let (width, height) = jpeg_size(&jpeg[2..]).unwrap();
        assert!(width > 0 && height > 0);
    }
}
