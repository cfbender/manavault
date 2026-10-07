//! Timestamp text as stored in SQLite (ISO 8601), in the formats earlier
//! releases wrote.

use time::format_description::well_known::Rfc3339;
use time::macros::format_description;
use time::{OffsetDateTime, PrimitiveDateTime, UtcOffset};

/// `:utc_datetime` text, such as `2026-10-07T07:30:43Z`.
#[must_use]
pub fn utc_seconds(at: OffsetDateTime) -> String {
    let at = at.to_offset(UtcOffset::UTC);
    at.format(format_description!(
        "[year]-[month]-[day]T[hour]:[minute]:[second]Z"
    ))
    .unwrap_or_default()
}

/// `:utc_datetime_usec` text, such as `2026-10-07T07:30:43.123456Z`.
#[must_use]
pub fn utc_micros(at: OffsetDateTime) -> String {
    let at = at.to_offset(UtcOffset::UTC);
    at.format(format_description!(
        "[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:6]Z"
    ))
    .unwrap_or_default()
}

/// The current time as `:utc_datetime` text.
#[must_use]
pub fn now() -> String {
    utc_seconds(OffsetDateTime::now_utc())
}

/// The current time as `:utc_datetime_usec` text.
#[must_use]
pub fn now_micros() -> String {
    utc_micros(OffsetDateTime::now_utc())
}

/// Parses stored timestamp text: RFC 3339 with or without fractional seconds,
/// or a naive `YYYY-MM-DD[T ]HH:MM:SS[.f]` read as UTC.
#[must_use]
pub fn parse(value: &str) -> Option<OffsetDateTime> {
    if let Ok(at) = OffsetDateTime::parse(value, &Rfc3339) {
        return Some(at);
    }
    let normalized = value.trim_end_matches('Z').replace(' ', "T");
    let (base, fraction) = match normalized.split_once('.') {
        Some((base, fraction)) => (base.to_owned(), Some(fraction.to_owned())),
        None => (normalized, None),
    };
    let at = PrimitiveDateTime::parse(
        &base,
        format_description!("[year]-[month]-[day]T[hour]:[minute]:[second]"),
    )
    .ok()?
    .assume_utc();
    let nanos = fraction
        .and_then(|digits| format!("{digits:0<9}").get(..9)?.parse::<u32>().ok())
        .unwrap_or(0);
    at.replace_nanosecond(nanos).ok()
}

/// Re-renders stored timestamp text as `:utc_datetime` ISO 8601, the way
/// Absinthe serializes `DateTime.to_iso8601/1` values. Unparseable text is
/// returned unchanged.
#[must_use]
pub fn iso8601(value: &str) -> String {
    parse(value).map_or_else(|| value.to_owned(), utc_seconds)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_stored_formats() {
        let at = parse("2026-10-07T07:30:43Z").unwrap();
        assert_eq!(utc_seconds(at), "2026-10-07T07:30:43Z");
        let at = parse("2026-10-07T07:30:43.123456Z").unwrap();
        assert_eq!(utc_micros(at), "2026-10-07T07:30:43.123456Z");
        let at = parse("2026-10-07 07:30:43").unwrap();
        assert_eq!(utc_seconds(at), "2026-10-07T07:30:43Z");
        assert_eq!(iso8601("garbage"), "garbage");
    }
}
