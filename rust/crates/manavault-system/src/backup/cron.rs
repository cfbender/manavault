//! The owner's cloud backup schedule (`Manavault.Backup.Cron`): five-field
//! cron expressions with `*`, lists, ranges, and steps; weekday 7 is Sunday.
//! Parse errors use fixed messages, which the settings form shows.
//!
//! When both day-of-month and day-of-week are restricted, a time matches
//! either one, as in standard cron. Earlier releases required both, so
//! `0 3 1 * 1` only fired on Mondays that fall on the 1st (a bug fixed here).

use std::collections::BTreeSet;
use std::ops::RangeInclusive;

use time::OffsetDateTime;

/// A parsed schedule.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Schedule {
    minute: BTreeSet<u8>,
    hour: BTreeSet<u8>,
    day: BTreeSet<u8>,
    month: BTreeSet<u8>,
    weekday: BTreeSet<u8>,
    day_restricted: bool,
    weekday_restricted: bool,
}

const FIELDS: [(&str, RangeInclusive<u8>); 5] = [
    ("minute", 0..=59),
    ("hour", 0..=23),
    ("day", 1..=31),
    ("month", 1..=12),
    ("weekday", 0..=7),
];

/// `Integer.parse/1` matching the whole string: an optional sign and digits.
fn parse_int(value: &str) -> Option<i64> {
    let digits = value.strip_prefix(['+', '-']).unwrap_or(value);
    if digits.is_empty() || !digits.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    value.parse().ok()
}

fn in_range(value: i64, range: &RangeInclusive<u8>) -> Option<u8> {
    u8::try_from(value)
        .ok()
        .filter(|value| range.contains(value))
}

fn range_values(range: RangeInclusive<u8>, step: usize) -> BTreeSet<u8> {
    range.step_by(step).collect()
}

fn parse_base(base: &str, range: &RangeInclusive<u8>, step: usize) -> Result<BTreeSet<u8>, String> {
    if base == "*" {
        return Ok(range_values(range.clone(), step));
    }
    match base.split_once('-') {
        None => {
            let value = parse_int(base).ok_or_else(|| format!("bad value {base}"))?;
            if let Some(value) = in_range(value, range) {
                Ok(BTreeSet::from([value]))
            } else {
                Err(format!(
                    "{value} is outside {}-{}",
                    range.start(),
                    range.end()
                ))
            }
        }
        Some((first, last)) => match (
            parse_int(first).and_then(|v| in_range(v, range)),
            parse_int(last).and_then(|v| in_range(v, range)),
        ) {
            (Some(first), Some(last)) if first <= last => Ok(range_values(first..=last, step)),
            _ => Err(format!("bad range {base}")),
        },
    }
}

fn parse_part(part: &str, range: &RangeInclusive<u8>) -> Result<BTreeSet<u8>, String> {
    match part.split_once('/') {
        None => parse_base(part, range, 1),
        Some((base, step)) => {
            let step = parse_int(step)
                .filter(|step| *step > 0)
                .and_then(|step| usize::try_from(step).ok())
                .ok_or_else(|| format!("bad step {step:?}"))?;
            parse_base(base, range, step)
        }
    }
}

fn parse_field(field: &str, range: &RangeInclusive<u8>) -> Result<BTreeSet<u8>, String> {
    if field == "*" {
        return Ok(range.clone().collect());
    }
    let mut values = BTreeSet::new();
    for part in field.split(',').filter(|part| !part.is_empty()) {
        values.extend(parse_part(part, range)?);
    }
    Ok(values)
}

impl Schedule {
    /// Parses an expression; the error is the settings validation message.
    pub fn parse(expression: &str) -> Result<Self, String> {
        let fields: Vec<&str> = expression.split_whitespace().collect();
        if fields.len() != 5 {
            return Err("must contain five fields".to_owned());
        }
        let mut sets = Vec::with_capacity(5);
        for (field, (name, range)) in fields.iter().zip(FIELDS.iter()) {
            sets.push(
                parse_field(field, range).map_err(|reason| format!("invalid {name}: {reason}"))?,
            );
        }
        let mut sets = sets.into_iter();
        let mut next = || sets.next().unwrap_or_default();
        Ok(Self {
            minute: next(),
            hour: next(),
            day: next(),
            month: next(),
            weekday: next(),
            day_restricted: fields.get(2).is_some_and(|field| *field != "*"),
            weekday_restricted: fields.get(4).is_some_and(|field| *field != "*"),
        })
    }

    /// Whether the schedule fires during the minute containing `at` (UTC).
    #[must_use]
    pub fn matches(&self, at: OffsetDateTime) -> bool {
        let weekday = at.weekday().number_days_from_sunday();
        let weekday_ok =
            self.weekday.contains(&weekday) || (weekday == 0 && self.weekday.contains(&7));
        let day_ok = self.day.contains(&at.day());
        let day_match = if self.day_restricted && self.weekday_restricted {
            day_ok || weekday_ok
        } else {
            day_ok && weekday_ok
        };
        self.minute.contains(&at.minute())
            && self.hour.contains(&at.hour())
            && self.month.contains(&u8::from(at.month()))
            && day_match
    }
}

/// `Cron.matches?/2`: invalid expressions never match.
#[must_use]
pub fn matches(expression: &str, at: OffsetDateTime) -> bool {
    Schedule::parse(expression).is_ok_and(|schedule| schedule.matches(at))
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    #[test]
    fn matches_wildcard_step_and_exact_fields() {
        let monday = datetime!(2026-06-22 03:15:00 UTC);
        assert!(matches("*/15 3 * * 1", monday));
        assert!(!matches("*/20 3 * * 1", monday));
        assert!(!matches("*/15 4 * * 1", monday));
        let sunday = datetime!(2026-06-21 03:00:00 UTC);
        assert!(matches("0 3 * * 7", sunday));
        assert!(matches("0 3 * * 1-7", sunday));
        assert!(
            matches("0 3 21 * 1", sunday),
            "day OR weekday when both are restricted"
        );
        assert!(!matches("0 3 22 * 3", sunday));
    }

    #[test]
    fn validates_five_field_expressions() {
        assert!(Schedule::parse("0 3 * * *").is_ok());
        assert_eq!(
            Schedule::parse("0 3 * *"),
            Err("must contain five fields".into())
        );
        assert_eq!(
            Schedule::parse("99 3 * * *"),
            Err("invalid minute: 99 is outside 0-59".into())
        );
        assert_eq!(
            Schedule::parse("0 3 * * 5-2"),
            Err("invalid weekday: bad range 5-2".into())
        );
        assert_eq!(
            Schedule::parse("*/0 3 * * *"),
            Err("invalid minute: bad step \"0\"".into())
        );
        assert_eq!(
            Schedule::parse("x 3 * * *"),
            Err("invalid minute: bad value x".into())
        );
    }
}
