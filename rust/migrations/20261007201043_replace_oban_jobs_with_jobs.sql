-- Migration 20261007201043 (replace_oban_jobs_with_jobs).
--
-- Background jobs get their own table with only the columns the workers
-- use. Jobs the earlier release had not finished move over (any still
-- marked executing when the old process stopped are queued again), the
-- worker names become the Rust ones, and the Oban table is dropped.

CREATE TABLE "jobs" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "worker" TEXT NOT NULL,
  "queue" TEXT NOT NULL,
  "args" TEXT NOT NULL DEFAULT '{}',
  "state" TEXT NOT NULL DEFAULT 'queued'
    CHECK ("state" IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "max_attempts" INTEGER NOT NULL,
  "run_at" TEXT NOT NULL,
  "started_at" TEXT,
  "finished_at" TEXT,
  "last_error" TEXT,
  "inserted_at" TEXT NOT NULL
);

CREATE INDEX "jobs_queue_state_run_at_index" ON "jobs" ("queue", "state", "run_at", "id");

CREATE INDEX "jobs_worker_index" ON "jobs" ("worker", "id");

INSERT INTO "jobs" ("worker", "queue", "args", "state", "attempt", "max_attempts", "run_at", "inserted_at")
SELECT
  CASE "worker"
    WHEN 'Manavault.Catalog.ScryfallCatalogWorker' THEN 'scryfall_catalog'
    WHEN 'Manavault.Catalog.ScryfallAssetsWorker' THEN 'scryfall_assets'
    WHEN 'Manavault.Pricing.VendorSyncWorker' THEN 'vendor_prices'
    WHEN 'Manavault.Scanner.BundleUpdateWorker' THEN 'scanner_bundle'
    WHEN 'Manavault.Backup.CloudBackupWorker' THEN 'cloud_backup'
    WHEN 'Manavault.Catalog.Decks.ExternalDeckSyncWorker' THEN 'external_deck_sync'
    WHEN 'Manavault.AI.DeckAnalysisWorker' THEN 'deck_analysis'
    WHEN 'Manavault.AI.DeckQuestionWorker' THEN 'deck_question'
    WHEN 'ManavaultWeb.DeckSharePreview.RenderWorker' THEN 'share_preview_render'
  END,
  "queue",
  "args",
  'queued',
  "attempt",
  "max_attempts",
  "scheduled_at",
  "inserted_at"
FROM "oban_jobs"
WHERE "state" IN ('available', 'scheduled', 'retryable', 'executing')
  AND "worker" IN (
    'Manavault.Catalog.ScryfallCatalogWorker',
    'Manavault.Catalog.ScryfallAssetsWorker',
    'Manavault.Pricing.VendorSyncWorker',
    'Manavault.Scanner.BundleUpdateWorker',
    'Manavault.Backup.CloudBackupWorker',
    'Manavault.Catalog.Decks.ExternalDeckSyncWorker',
    'Manavault.AI.DeckAnalysisWorker',
    'Manavault.AI.DeckQuestionWorker',
    'ManavaultWeb.DeckSharePreview.RenderWorker'
  )
ORDER BY "id";

DROP TABLE "oban_jobs";
