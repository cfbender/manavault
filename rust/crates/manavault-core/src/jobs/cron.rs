//! Five-field cron expressions (minute hour day-of-month month day-of-week),
//! with the `@hourly`/`@daily`/`@weekly`/`@monthly`/`@yearly` nicknames that
//! `Oban.Cron` accepts. `@reboot` is handled by the scheduler, not here.

use time::OffsetDateTime;

#[derive(Debug, Clone, PartialEq, Eq)]
struct Field {
    allowed: Vec<bool>,
    min: u8,
}

impl Field {
    fn matches(&self, value: u8) -> bool {
        value
            .checked_sub(self.min)
            .and_then(|index| self.allowed.get(usize::from(index)))
            .copied()
            .unwrap_or(false)
    }

    fn parse(text: &str, min: u8, max: u8) -> Option<Self> {
        let mut allowed = vec![false; usize::from(max - min) + 1];
        for part in text.split(',') {
            let (range, step) = match part.split_once('/') {
                Some((range, step)) => (range, step.parse::<u8>().ok().filter(|s| *s > 0)?),
                None => (part, 1),
            };
            let (start, end) = if range == "*" {
                (min, max)
            } else if let Some((start, end)) = range.split_once('-') {
                (start.parse().ok()?, end.parse().ok()?)
            } else {
                let value: u8 = range.parse().ok()?;
                (value, if part.contains('/') { max } else { value })
            };
            if start < min || end > max || start > end {
                return None;
            }
            let mut value = start;
            while value <= end {
                *allowed.get_mut(usize::from(value - min))? = true;
                value = value.checked_add(step)?;
            }
        }
        Some(Self { allowed, min })
    }
}

/// A parsed cron expression.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cron {
    minute: Field,
    hour: Field,
    day: Field,
    month: Field,
    weekday: Field,
    day_restricted: bool,
    weekday_restricted: bool,
}

impl Cron {
    /// Parses an expression; `None` when it is invalid.
    #[must_use]
    pub fn parse(expression: &str) -> Option<Self> {
        let expanded = match expression.trim() {
            "@hourly" => "0 * * * *",
            "@daily" | "@midnight" => "0 0 * * *",
            "@weekly" => "0 0 * * 0",
            "@monthly" => "0 0 1 * *",
            "@yearly" | "@annually" => "0 0 1 1 *",
            other => other,
        };
        let fields: Vec<&str> = expanded.split_whitespace().collect();
        let [minute, hour, day, month, weekday] = fields.as_slice() else {
            return None;
        };
        let weekday_field = Field::parse(&weekday.replace('7', "0"), 0, 6)?;
        Some(Self {
            minute: Field::parse(minute, 0, 59)?,
            hour: Field::parse(hour, 0, 23)?,
            day: Field::parse(day, 1, 31)?,
            month: Field::parse(month, 1, 12)?,
            weekday: weekday_field,
            day_restricted: *day != "*",
            weekday_restricted: *weekday != "*",
        })
    }

    /// Whether the expression fires during the minute containing `at` (UTC).
    #[must_use]
    pub fn matches(&self, at: OffsetDateTime) -> bool {
        let day_ok = self.day.matches(at.day());
        let weekday_ok = self.weekday.matches(at.weekday().number_days_from_sunday());
        let day_match = match (self.day_restricted, self.weekday_restricted) {
            (true, true) => day_ok || weekday_ok,
            _ => day_ok && weekday_ok,
        };
        self.minute.matches(at.minute())
            && self.hour.matches(at.hour())
            && self.month.matches(u8::from(at.month()))
            && day_match
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::datetime;

    #[test]
    fn matches_common_expressions() {
        let daily = Cron::parse("@daily").unwrap();
        assert!(daily.matches(datetime!(2026-10-07 00:00:30 UTC)));
        assert!(!daily.matches(datetime!(2026-10-07 00:01:00 UTC)));
        let every_30 = Cron::parse("*/30 * * * *").unwrap();
        assert!(every_30.matches(datetime!(2026-10-07 05:30:00 UTC)));
        assert!(!every_30.matches(datetime!(2026-10-07 05:31:00 UTC)));
        let six_hours = Cron::parse("0 */6 * * *").unwrap();
        assert!(six_hours.matches(datetime!(2026-10-07 18:00:00 UTC)));
        assert!(!six_hours.matches(datetime!(2026-10-07 19:00:00 UTC)));
        let weekdays = Cron::parse("0 3 * * 1-5").unwrap();
        assert!(weekdays.matches(datetime!(2026-10-07 03:00:00 UTC)));
        assert!(!weekdays.matches(datetime!(2026-10-04 03:00:00 UTC)));
        assert!(Cron::parse("61 * * * *").is_none());
        assert!(Cron::parse("not cron").is_none());
    }
}
