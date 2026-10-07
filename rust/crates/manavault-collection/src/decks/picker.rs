//! "What should I play tonight?" (`Decks.DeckPicker`): a weighted random
//! pick among active decks included for play.

use sqlx::SqlitePool;
use time::OffsetDateTime;

use crate::decks::model::{DeckId, DeckRow};

const UNPLAYED_RECENCY_HOURS: i64 = 24 * 30;

fn recency_hours(last_played_at: OffsetDateTime, now: OffsetDateTime) -> i64 {
    ((now - last_played_at).whole_hours() + 1).max(1)
}

/// `DeckPicker.selection_weights/2`: recency (hours since the last play,
/// unplayed decks counting as the longest recency plus 30 days) times
/// `(skips + 1) / (plays + 1)`.
#[must_use]
pub fn selection_weights(decks: &[DeckRow], now: OffsetDateTime) -> Vec<(&DeckRow, f64)> {
    let played = |deck: &DeckRow| {
        deck.last_played_at
            .map(|at| recency_hours(at.as_datetime(), now))
    };
    let unplayed = decks
        .iter()
        .filter_map(played)
        .max()
        .unwrap_or(0)
        .saturating_add(UNPLAYED_RECENCY_HOURS)
        .max(UNPLAYED_RECENCY_HOURS);
    decks
        .iter()
        .map(|deck| {
            let recency = played(deck).unwrap_or(unplayed);
            let weight = to_f64(recency) * to_f64(deck.skip_count.saturating_add(1))
                / to_f64(deck.play_count.saturating_add(1));
            (deck, weight)
        })
        .collect()
}

fn to_f64(value: i64) -> f64 {
    // Counts and hours stay far below 2^52.
    i32::try_from(value).map_or(f64::from(i32::MAX), f64::from)
}

/// Picks a deck for `random` in `[0, 1]`; `None` without candidates.
#[must_use]
pub fn pick_weighted(decks: &[DeckRow], now: OffsetDateTime, random: f64) -> Option<&DeckRow> {
    let weighted = selection_weights(decks, now);
    let total: f64 = weighted.iter().map(|(_, weight)| weight).sum();
    let threshold = random.clamp(0.0, 1.0) * total;
    let mut cumulative = 0.0;
    for (deck, weight) in &weighted {
        cumulative += weight;
        if threshold <= cumulative {
            return Some(deck);
        }
    }
    weighted.last().map(|(deck, _)| *deck)
}

/// `DeckPicker.random_deck/1`: excludes the previous suggestion when
/// another deck is playable.
pub async fn random_deck(
    pool: &SqlitePool,
    exclude: Option<DeckId>,
    now: OffsetDateTime,
    random: f64,
) -> Result<Option<DeckRow>, sqlx::Error> {
    let mut decks = crate::deck_row_query!(
        "WHERE d.status = 'active' AND d.included_for_play ORDER BY d.name ASC, d.id ASC"
    )
    .fetch_all(pool)
    .await?;
    if decks.len() > 1 {
        decks.retain(|deck| Some(deck.id) != exclude);
    }
    Ok(pick_weighted(&decks, now, random).cloned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use manavault_core::timestamp::{self, Timestamp};

    fn deck(id: i64, play_count: i64, skip_count: i64, last_played_at: Option<&str>) -> DeckRow {
        DeckRow {
            id: DeckId(id),
            name: format!("Deck {id}"),
            format: crate::decks::model::DeckFormat::Commander,
            status: crate::decks::model::DeckStatus::Active,
            included_for_play: true,
            play_count,
            skip_count,
            last_played_at: last_played_at.map(|at| Timestamp::parse(at).unwrap()),
            primer: None,
            ai_analysis: None,
            ai_analysis_model: None,
            ai_analyzed_at: None,
            commander_bracket: None,
            commander_bracket_estimate: None,
            commander_bracket_rating: None,
            share_token: None,
            external_source: None,
            external_id: None,
            external_url: None,
            external_synced_at: None,
            external_sync_error: None,
            cover_deck_card_id: None,
            inserted_at: Timestamp::now(),
            updated_at: Timestamp::now(),
        }
    }

    // Weights grow with recency and skips, shrink with plays.
    #[test]
    fn selection_weights_follow_recency_skips_and_plays() {
        let now = timestamp::parse("2026-08-26T12:00:00Z").unwrap();
        let decks = vec![
            deck(1, 1, 0, Some("2026-08-25T12:00:00Z")),
            deck(2, 1, 0, Some("2026-08-16T12:00:00Z")),
            deck(3, 5, 0, Some("2026-08-25T12:00:00Z")),
            deck(4, 1, 2, Some("2026-08-25T12:00:00Z")),
            deck(5, 0, 0, None),
        ];
        let weights: std::collections::HashMap<i64, f64> = selection_weights(&decks, now)
            .into_iter()
            .map(|(deck, weight)| (deck.id.0, weight))
            .collect();
        assert!(weights[&2] > weights[&1]);
        assert!(weights[&1] > weights[&3]);
        assert!(weights[&4] > weights[&1]);
        assert!(weights[&5] > weights[&2]);
        // 25 hours of recency over two plays.
        assert!((weights[&1] - 12.5).abs() < f64::EPSILON);
    }

    #[test]
    fn random_picks_walk_the_cumulative_weights() {
        let now = timestamp::parse("2026-08-26T12:00:00Z").unwrap();
        let decks = vec![deck(1, 0, 0, None), deck(2, 0, 0, None)];
        assert_eq!(pick_weighted(&decks, now, 0.0).unwrap().id, DeckId(1));
        assert_eq!(pick_weighted(&decks, now, 1.0).unwrap().id, DeckId(2));
        assert_eq!(pick_weighted(&decks, now, 0.75).unwrap().id, DeckId(2));
        assert!(pick_weighted(&[], now, 0.5).is_none());
    }
}
