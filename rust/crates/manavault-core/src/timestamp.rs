//! Timestamps as the database stores them: UTC, ISO 8601 text.
//!
//! Record columns hold second precision (`2026-10-07T07:30:43Z`) as
//! [`Timestamp`]. The job queue and the log stream hold microsecond
//! precision (`2026-10-07T07:30:43.123456Z`) through [`micros`]. Each column
//! is written at one width so new rows sort chronologically as text; rows
//! from earlier releases may use other formats, which decoding accepts.

use std::fmt;
use std::ops::{Add, Sub};
use std::str::FromStr;

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use sqlx::encode::IsNull;
use sqlx::error::BoxDynError;
use sqlx::sqlite::{SqliteArgumentsBuffer, SqliteTypeInfo, SqliteValueRef};
use sqlx::{Decode, Encode, Sqlite, Type};
use time::format_description::well_known::Rfc3339;
use time::macros::format_description;
use time::{Duration, OffsetDateTime, PrimitiveDateTime, UtcOffset};

/// A UTC timestamp at second precision.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Timestamp(OffsetDateTime);

impl Timestamp {
    /// The current time.
    #[must_use]
    pub fn now() -> Self {
        Self::from(OffsetDateTime::now_utc())
    }

    /// Parses stored text in any format an earlier release wrote: RFC 3339
    /// with or without fractional seconds, or naive `YYYY-MM-DD HH:MM:SS`
    /// read as UTC. Fractional seconds are dropped.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        parse(text).map(Self::from)
    }

    #[must_use]
    pub fn as_datetime(self) -> OffsetDateTime {
        self.0
    }
}

impl From<OffsetDateTime> for Timestamp {
    fn from(at: OffsetDateTime) -> Self {
        Self(
            at.to_offset(UtcOffset::UTC)
                .replace_nanosecond(0)
                .unwrap_or(at),
        )
    }
}

impl From<Timestamp> for OffsetDateTime {
    fn from(at: Timestamp) -> Self {
        at.0
    }
}

impl Add<Duration> for Timestamp {
    type Output = Self;

    fn add(self, duration: Duration) -> Self {
        Self::from(self.0 + duration)
    }
}

impl Sub<Duration> for Timestamp {
    type Output = Self;

    fn sub(self, duration: Duration) -> Self {
        Self::from(self.0 - duration)
    }
}

impl Sub for Timestamp {
    type Output = Duration;

    fn sub(self, other: Self) -> Duration {
        self.0 - other.0
    }
}

impl fmt::Display for Timestamp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let text = self
            .0
            .format(format_description!(
                "[year]-[month]-[day]T[hour]:[minute]:[second]Z"
            ))
            .map_err(|_| fmt::Error)?;
        f.write_str(&text)
    }
}

impl FromStr for Timestamp {
    type Err = InvalidTimestamp;

    fn from_str(text: &str) -> Result<Self, InvalidTimestamp> {
        Self::parse(text).ok_or_else(|| InvalidTimestamp(text.to_owned()))
    }
}

/// Text that is not a timestamp.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("invalid timestamp: {0:?}")]
pub struct InvalidTimestamp(pub String);

impl Serialize for Timestamp {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_str(self)
    }
}

impl<'de> Deserialize<'de> for Timestamp {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let text = String::deserialize(deserializer)?;
        text.parse().map_err(serde::de::Error::custom)
    }
}

impl Type<Sqlite> for Timestamp {
    fn type_info() -> SqliteTypeInfo {
        <String as Type<Sqlite>>::type_info()
    }

    fn compatible(ty: &SqliteTypeInfo) -> bool {
        <String as Type<Sqlite>>::compatible(ty)
    }
}

impl Encode<'_, Sqlite> for Timestamp {
    fn encode_by_ref(&self, buf: &mut SqliteArgumentsBuffer) -> Result<IsNull, BoxDynError> {
        Encode::<Sqlite>::encode(self.to_string(), buf)
    }
}

impl<'r> Decode<'r, Sqlite> for Timestamp {
    fn decode(value: SqliteValueRef<'r>) -> Result<Self, BoxDynError> {
        let text = <&str as Decode<Sqlite>>::decode(value)?;
        Ok(text.parse()?)
    }
}

/// Microsecond-precision text, such as `2026-10-07T07:30:43.123456Z`.
#[must_use]
pub fn micros(at: OffsetDateTime) -> String {
    at.to_offset(UtcOffset::UTC)
        .format(format_description!(
            "[year]-[month]-[day]T[hour]:[minute]:[second].[subsecond digits:6]Z"
        ))
        .unwrap_or_default()
}

/// The current time as microsecond-precision text.
#[must_use]
pub fn now_micros() -> String {
    micros(OffsetDateTime::now_utc())
}

/// Parses stored text at full precision: RFC 3339 with or without fractional
/// seconds, or naive `YYYY-MM-DD[T ]HH:MM:SS[.f]` read as UTC.
#[must_use]
pub fn parse(text: &str) -> Option<OffsetDateTime> {
    if let Ok(at) = OffsetDateTime::parse(text, &Rfc3339) {
        return Some(at);
    }
    let normalized = text.trim_end_matches('Z').replace(' ', "T");
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timestamps_round_trip_at_second_precision() {
        let at = Timestamp::parse("2026-10-07T07:30:43Z").unwrap();
        assert_eq!(at.to_string(), "2026-10-07T07:30:43Z");
        assert_eq!(
            Timestamp::parse("2026-10-07T07:30:43.999999Z").unwrap(),
            at,
            "fractional seconds are dropped, not rounded"
        );
        assert_eq!(Timestamp::parse("2026-10-07 07:30:43").unwrap(), at);
        assert_eq!(
            Timestamp::parse("2026-10-07T09:30:43+02:00").unwrap(),
            at,
            "offsets normalize to UTC"
        );
        assert_eq!(Timestamp::parse("2026-10-07"), None);
        assert_eq!(Timestamp::parse("garbage"), None);
        assert_eq!(
            Timestamp::now(),
            Timestamp::parse(&Timestamp::now().to_string()).unwrap()
        );
    }

    #[test]
    fn timestamps_serialize_as_text() {
        let at = Timestamp::parse("2026-10-07T07:30:43Z").unwrap();
        assert_eq!(serde_json::to_value(at).unwrap(), "2026-10-07T07:30:43Z");
        assert_eq!(
            serde_json::from_value::<Timestamp>("2026-10-07T07:30:43Z".into()).unwrap(),
            at
        );
        assert!(serde_json::from_value::<Timestamp>("tomorrow".into()).is_err());
    }

    #[test]
    fn arithmetic_keeps_second_precision() {
        let at = Timestamp::parse("2026-10-07T07:30:43Z").unwrap();
        assert_eq!((at + Duration::days(1)).to_string(), "2026-10-08T07:30:43Z");
        assert_eq!((at + Duration::days(1)) - at, Duration::days(1));
        assert_eq!(
            (at + Duration::milliseconds(1500)).to_string(),
            "2026-10-07T07:30:44Z"
        );
    }

    #[tokio::test]
    async fn timestamps_store_as_canonical_text() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        sqlx::query("CREATE TABLE t (at TEXT)")
            .execute(&pool)
            .await
            .unwrap();
        let at = Timestamp::parse("2026-10-07T07:30:43Z").unwrap();
        sqlx::query("INSERT INTO t (at) VALUES (?1), ('2026-10-07 06:00:00'), ('2026-10-07T05:00:00.250000Z')")
            .bind(at)
            .execute(&pool)
            .await
            .unwrap();
        let text: String = sqlx::query_scalar("SELECT at FROM t WHERE at = ?1")
            .bind(at)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(text, "2026-10-07T07:30:43Z");
        // Rows from earlier releases decode too.
        let stored: Vec<Timestamp> = sqlx::query_scalar("SELECT at FROM t ORDER BY rowid")
            .fetch_all(&pool)
            .await
            .unwrap();
        assert_eq!(
            stored.iter().map(ToString::to_string).collect::<Vec<_>>(),
            [
                "2026-10-07T07:30:43Z",
                "2026-10-07T06:00:00Z",
                "2026-10-07T05:00:00Z"
            ]
        );
        assert!(
            sqlx::query_scalar::<_, Timestamp>("SELECT 'yesterday'")
                .fetch_one(&pool)
                .await
                .is_err()
        );
    }

    #[test]
    fn micros_keep_six_digits() {
        let at = parse("2026-10-07T07:30:43.123456Z").unwrap();
        assert_eq!(micros(at), "2026-10-07T07:30:43.123456Z");
        let at = parse("2026-10-07T07:30:43Z").unwrap();
        assert_eq!(micros(at), "2026-10-07T07:30:43.000000Z");
        assert_eq!(
            micros(parse("2026-10-07 07:30:43.5").unwrap()),
            "2026-10-07T07:30:43.500000Z"
        );
    }
}
