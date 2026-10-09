-- Migration 20261009014330 (add_acquisition_price_rebuilds).
--
-- One row per run of the acquisition price rebuild: the job that resets
-- `collection_items.acquisition_market_price_cents` from MTGJSON's price
-- history for items added inside the history window. The newest row is the
-- status the settings page shows.

CREATE TABLE "acquisition_price_rebuilds" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  "status" TEXT NOT NULL
    CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed')),
  "source" TEXT,
  "started_at" TEXT,
  "completed_at" TEXT,
  "history_from" TEXT,
  "history_to" TEXT,
  "items_in_window" INTEGER NOT NULL DEFAULT 0,
  "items_updated" INTEGER NOT NULL DEFAULT 0,
  "items_without_history" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "inserted_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL
);
