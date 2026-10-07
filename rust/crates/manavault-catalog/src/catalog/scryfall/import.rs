//! Writes Scryfall cards into `scryfall_cards`, `scryfall_printings`, and
//! `scryfall_card_tokens` (`Manavault.Catalog.Scryfall.Import`).
//!
//! Cards arrive in batches of [`BATCH_SIZE`]. Each batch is filtered, turned
//! into rows, narrowed to the rows whose stored data differs, and written in
//! one `BEGIN IMMEDIATE` transaction; a batch with nothing to write never
//! takes the write lock.

use std::collections::HashSet;
use std::time::{Duration, Instant};

use futures_util::{Stream, StreamExt as _};
use lotus::scryfall::ScryfallCard;
use lotus::scryfall::catalog::{EXCLUDED_SET_TYPES, is_bare_card, is_non_game_insert};
use serde_json::Value;
use sqlx::SqlitePool;

use crate::catalog::oracle_tags::{self, OracleTagIndex};
use crate::catalog::scryfall::diff::{self, Changes};
use crate::catalog::scryfall::push_in_list;
use crate::catalog::scryfall::reconcile;
use crate::catalog::scryfall::rows;
use manavault_core::state::AppState;
use manavault_core::timefmt;

/// Cards per batch transaction.
pub const BATCH_SIZE: usize = 200;

/// SQLite has no lock queue: a writer blocked on the database-wide write
/// lock (the job stager, a user saving a card) re-polls it, and the busy
/// handler polls only every 50 ms or so once its initial ramp is spent.
/// Back-to-back batch commits leave only a few ms between transactions, so a
/// waiter could miss every poll until its busy timeout expires. Keeping at
/// least this much time between one commit and the next `BEGIN` guarantees
/// every waiter's next poll finds the lock free. Decoding and diffing the
/// next batch already happens in that gap, so the sleep only covers whatever
/// time remains.
pub const MIN_COMMIT_GAP: Duration = Duration::from_millis(75);

const PROGRESS_SOURCE_CARD_INTERVAL: usize = 5_000;

/// What to do with the oracle tag columns.
#[derive(Debug, Clone)]
pub enum OracleTags {
    /// Replace them from these tags (Scryfall's oracle-tags bulk records).
    /// An empty list still replaces them: untagged cards keep only their
    /// type-line themes.
    Replace(Vec<Value>),
    /// Leave the stored oracle tag columns alone (the tags bulk could not be
    /// fetched). New cards get the column defaults.
    Skip,
}

impl Default for OracleTags {
    fn default() -> Self {
        Self::Replace(Vec::new())
    }
}

/// Import options (`Import.run/3` keyword options).
#[derive(Debug, Clone, Default)]
pub struct ImportOptions {
    pub oracle_tags: OracleTags,
    /// Log start, progress every 5,000 source cards, and completion.
    pub log_progress: bool,
    /// The number of source records, for progress logs. Defaults to the
    /// number of cards when they are passed as a list.
    pub source_count: Option<usize>,
    /// Remove stored printings the import did not see (a full catalog sync).
    pub reconcile: bool,
    /// The bulk file the cards came from, echoed in the summary.
    pub bulk_uri: Option<String>,
}

/// What an import did.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ImportSummary {
    /// Card rows built (one per printing with an oracle id).
    pub cards_count: usize,
    /// Printing rows built.
    pub printings_count: usize,
    /// Card rows that differed from the stored row and were written.
    pub written_cards_count: usize,
    /// Printing rows that differed from the stored row and were written.
    pub written_printings_count: usize,
    /// Source records processed, excluded ones included.
    pub source_count: usize,
    pub bulk_uri: Option<String>,
    /// Batches that wrote anything (took the write lock).
    pub committed_batches: usize,
    /// Printings whose token links were replaced.
    pub relinked_count: usize,
}

#[derive(Debug, thiserror::Error)]
pub enum ImportError {
    #[error(transparent)]
    Db(#[from] sqlx::Error),
    /// The source could not be decoded (`BulkData.DecodeError`).
    #[error("{0}")]
    Decode(String),
}

/// Memorabilia and token sets are skipped, except for the tokens and
/// emblems themselves: those sets also carry art cards. Scryfall types game
/// helpers (The Monarch, On an Adventure, Day // Night, Punchcard) as a bare
/// "Card", like non-game inserts (World Championship decklists and ads,
/// Booster Blitz minigame cards, checklists, substitute cards). Helpers
/// printed as tokens are kept; inserts, and bare "Card" cards Scryfall does
/// not file as tokens (Secret Lair "Red Mana", Experience and Poison
/// counters), are not.
///
/// This is lotus's `import_policy` without its paper filter, which the sync
/// applies before importing (`Catalog.import_cards/1` keeps digital cards).
#[must_use]
pub fn excluded(card: &ScryfallCard) -> bool {
    is_non_game_insert(card)
        || (!card.is_token()
            && (is_bare_card(card.type_line.as_deref())
                || card
                    .set_type
                    .as_deref()
                    .is_some_and(|set_type| EXCLUDED_SET_TYPES.contains(&set_type))))
}

/// Imports cards with the default options (`Catalog.import_cards/1`): oracle
/// tag columns are replaced from an empty tag list.
pub async fn import_cards(
    pool: &SqlitePool,
    cards: Vec<ScryfallCard>,
) -> Result<ImportSummary, ImportError> {
    import_cards_with(pool, cards, ImportOptions::default()).await
}

/// Imports a list of cards (`Catalog.import_cards/3`).
pub async fn import_cards_with(
    pool: &SqlitePool,
    cards: Vec<ScryfallCard>,
    mut options: ImportOptions,
) -> Result<ImportSummary, ImportError> {
    options.source_count.get_or_insert(cards.len());
    let mut batches = Vec::new();
    let mut cards = cards.into_iter().peekable();
    while cards.peek().is_some() {
        batches.push(Ok(cards.by_ref().take(BATCH_SIZE).collect::<Vec<_>>()));
    }
    run(pool, futures_util::stream::iter(batches), options).await
}

/// Imports cards and then drops cached catalog reads
/// (`Manavault.Catalog.Cached.import_cards/3`).
pub async fn import(
    state: &AppState,
    cards: Vec<ScryfallCard>,
    options: ImportOptions,
) -> Result<ImportSummary, ImportError> {
    let summary = import_cards_with(&state.db, cards, options).await?;
    crate::catalog::invalidate_after_import(state).await;
    Ok(summary)
}

struct Progress {
    summary: ImportSummary,
    seen_scryfall_ids: Option<HashSet<String>>,
    last_commit_at: Option<Instant>,
    next_log_at: usize,
}

/// Imports a stream of card batches (`Import.run/3`). The batches should be
/// at most [`BATCH_SIZE`] cards: each is written in one transaction.
pub async fn run<S>(
    pool: &SqlitePool,
    batches: S,
    options: ImportOptions,
) -> Result<ImportSummary, ImportError>
where
    S: Stream<Item = Result<Vec<ScryfallCard>, ImportError>>,
{
    let (tag_index, replace_tags) = match &options.oracle_tags {
        OracleTags::Replace(tags) => (oracle_tags::build_index(tags), true),
        OracleTags::Skip => (OracleTagIndex::new(), false),
    };
    let source_count = options
        .source_count
        .map_or_else(String::new, |count| count.to_string());
    if options.log_progress {
        tracing::info!("Scryfall catalog import started source_cards={source_count}");
    }

    let result = import_batches(pool, batches, &tag_index, replace_tags, &options).await;
    match result {
        Ok(mut progress) => {
            if let Some(seen) = progress.seen_scryfall_ids.take()
                && let Err(error) = reconcile::run(pool, &seen).await
            {
                log_failed(&options, &error.to_string());
                return Err(error.into());
            }
            let mut summary = progress.summary;
            summary.bulk_uri.clone_from(&options.bulk_uri);
            if options.log_progress {
                tracing::info!(
                    "Scryfall catalog import completed source_cards={source_count} cards={} printings={} {}",
                    summary.cards_count,
                    summary.printings_count,
                    written_counts_log(&summary)
                );
            }
            Ok(summary)
        }
        Err(error) => {
            log_failed(&options, &error.to_string());
            Err(error)
        }
    }
}

fn log_failed(options: &ImportOptions, reason: &str) {
    if options.log_progress {
        tracing::warn!("Scryfall catalog import failed error={reason:?}");
    }
}

fn written_counts_log(summary: &ImportSummary) -> String {
    format!(
        "written_cards={} written_printings={}",
        summary.written_cards_count, summary.written_printings_count
    )
}

async fn import_batches<S>(
    pool: &SqlitePool,
    batches: S,
    tag_index: &OracleTagIndex,
    replace_tags: bool,
    options: &ImportOptions,
) -> Result<Progress, ImportError>
where
    S: Stream<Item = Result<Vec<ScryfallCard>, ImportError>>,
{
    let mut progress = Progress {
        summary: ImportSummary::default(),
        seen_scryfall_ids: options.reconcile.then(HashSet::new),
        last_commit_at: None,
        next_log_at: PROGRESS_SOURCE_CARD_INTERVAL,
    };
    let mut batches = std::pin::pin!(batches);
    while let Some(batch) = batches.next().await {
        let batch = batch?;
        let batch_len = batch.len();
        let kept: Vec<ScryfallCard> = batch.into_iter().filter(|card| !excluded(card)).collect();
        let rows = rows::rows(kept, tag_index);
        let card_rows = rows.cards.len();
        let printing_rows = rows.printings.len();
        if let Some(seen) = progress.seen_scryfall_ids.as_mut() {
            seen.extend(rows.printings.iter().map(|row| row.scryfall_id.clone()));
        }
        let changes = diff::changes(pool, rows, replace_tags).await?;
        wait_for_commit_gap(progress.last_commit_at).await;

        let summary = &mut progress.summary;
        summary.source_count += batch_len;
        summary.cards_count += card_rows;
        summary.printings_count += printing_rows;
        summary.written_cards_count += changes.cards.len();
        summary.written_printings_count += changes.printings.len();
        summary.relinked_count += changes.relinked_scryfall_ids.len();
        if !changes.is_empty() {
            write_batch(pool, &changes, replace_tags).await?;
            progress.last_commit_at = Some(Instant::now());
            progress.summary.committed_batches += 1;
        }
        log_progress(&mut progress, options);
    }
    Ok(progress)
}

fn log_progress(progress: &mut Progress, options: &ImportOptions) {
    if !options.log_progress {
        return;
    }
    let processed = progress.summary.source_count;
    if processed >= progress.next_log_at || Some(processed) == options.source_count {
        let total = options
            .source_count
            .map_or_else(String::new, |count| count.to_string());
        tracing::info!(
            "Scryfall catalog import progress source_cards={processed}/{total} cards={} printings={} {}",
            progress.summary.cards_count,
            progress.summary.printings_count,
            written_counts_log(&progress.summary)
        );
        progress.next_log_at =
            (processed / PROGRESS_SOURCE_CARD_INTERVAL + 1) * PROGRESS_SOURCE_CARD_INTERVAL;
    }
}

async fn wait_for_commit_gap(last_commit_at: Option<Instant>) {
    if let Some(remaining) = last_commit_at.and_then(|at| MIN_COMMIT_GAP.checked_sub(at.elapsed()))
    {
        tokio::time::sleep(remaining).await;
    }
}

async fn write_batch(
    pool: &SqlitePool,
    changes: &Changes,
    replace_tags: bool,
) -> Result<(), sqlx::Error> {
    let now = timefmt::now();
    let mut tx = manavault_core::db::begin_write(pool).await?;
    for row in &changes.cards {
        let core = &row.core;
        if replace_tags {
            sqlx::query!(
                "INSERT INTO scryfall_cards (oracle_id, name, normalized_name, layout, type_line, oracle_text, mana_cost, cmc, colors, color_identity, legalities, game_changer, edhrec_rank, rulings_uri, oracle_tags, deck_category, deck_themes, inserted_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?18)
                 ON CONFLICT (oracle_id) DO UPDATE SET name = excluded.name, normalized_name = excluded.normalized_name,
                   layout = excluded.layout, type_line = excluded.type_line, oracle_text = excluded.oracle_text,
                   mana_cost = excluded.mana_cost, cmc = excluded.cmc, colors = excluded.colors,
                   color_identity = excluded.color_identity, legalities = excluded.legalities,
                   game_changer = excluded.game_changer, edhrec_rank = excluded.edhrec_rank,
                   rulings_uri = excluded.rulings_uri, oracle_tags = excluded.oracle_tags,
                   deck_category = excluded.deck_category, deck_themes = excluded.deck_themes,
                   updated_at = excluded.updated_at",
                row.oracle_id,
                core.name,
                core.normalized_name,
                core.layout,
                core.type_line,
                core.oracle_text,
                core.mana_cost,
                core.cmc,
                core.colors,
                core.color_identity,
                core.legalities,
                core.game_changer,
                core.edhrec_rank,
                row.rulings_uri,
                row.tags.oracle_tags,
                row.tags.deck_category,
                row.tags.deck_themes,
                now,
            )
            .execute(&mut *tx)
            .await?;
        } else {
            sqlx::query!(
                "INSERT INTO scryfall_cards (oracle_id, name, normalized_name, layout, type_line, oracle_text, mana_cost, cmc, colors, color_identity, legalities, game_changer, edhrec_rank, rulings_uri, inserted_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15)
                 ON CONFLICT (oracle_id) DO UPDATE SET name = excluded.name, normalized_name = excluded.normalized_name,
                   layout = excluded.layout, type_line = excluded.type_line, oracle_text = excluded.oracle_text,
                   mana_cost = excluded.mana_cost, cmc = excluded.cmc, colors = excluded.colors,
                   color_identity = excluded.color_identity, legalities = excluded.legalities,
                   game_changer = excluded.game_changer, edhrec_rank = excluded.edhrec_rank,
                   rulings_uri = excluded.rulings_uri, updated_at = excluded.updated_at",
                row.oracle_id,
                core.name,
                core.normalized_name,
                core.layout,
                core.type_line,
                core.oracle_text,
                core.mana_cost,
                core.cmc,
                core.colors,
                core.color_identity,
                core.legalities,
                core.game_changer,
                core.edhrec_rank,
                row.rulings_uri,
                now,
            )
            .execute(&mut *tx)
            .await?;
        }
    }
    for row in &changes.printings {
        let p = &row.fields;
        sqlx::query!(
            "INSERT INTO scryfall_printings (scryfall_id, oracle_id, set_code, set_name, collector_number, illustration_id, lang, flavor_name, normalized_flavor_name, flavor_text, rarity, finishes, promo_types, promo, image_uris, prices, released_at, tcgplayer_id, tcgplayer_etched_id, inserted_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?20)
             ON CONFLICT (scryfall_id) DO UPDATE SET oracle_id = excluded.oracle_id, set_code = excluded.set_code,
               set_name = excluded.set_name, collector_number = excluded.collector_number,
               illustration_id = excluded.illustration_id, lang = excluded.lang, flavor_name = excluded.flavor_name,
               normalized_flavor_name = excluded.normalized_flavor_name, flavor_text = excluded.flavor_text,
               rarity = excluded.rarity, finishes = excluded.finishes, promo_types = excluded.promo_types,
               promo = excluded.promo, image_uris = excluded.image_uris, prices = excluded.prices,
               released_at = excluded.released_at, tcgplayer_id = excluded.tcgplayer_id,
               tcgplayer_etched_id = excluded.tcgplayer_etched_id, updated_at = excluded.updated_at",
            row.scryfall_id,
            p.oracle_id,
            p.set_code,
            p.set_name,
            p.collector_number,
            p.illustration_id,
            p.lang,
            p.flavor_name,
            p.normalized_flavor_name,
            p.flavor_text,
            p.rarity,
            p.finishes,
            p.promo_types,
            p.promo,
            p.image_uris,
            p.prices,
            p.released_at,
            p.tcgplayer_id,
            p.tcgplayer_etched_id,
            now,
        )
        .execute(&mut *tx)
        .await?;
    }
    // A relinked printing's token links are replaced wholesale so links
    // Scryfall dropped disappear on the next import rather than lingering.
    for ids in changes.relinked_scryfall_ids.chunks(BATCH_SIZE) {
        let mut builder =
            sqlx::QueryBuilder::new("DELETE FROM scryfall_card_tokens WHERE scryfall_id IN");
        push_in_list(&mut builder, ids);
        builder.build().execute(&mut *tx).await?;
    }
    for link in &changes.card_tokens {
        sqlx::query!(
            "INSERT INTO scryfall_card_tokens (scryfall_id, token_scryfall_id) VALUES (?1, ?2) ON CONFLICT DO NOTHING",
            link.scryfall_id,
            link.token_scryfall_id,
        )
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await
}
