-- Migration 20261004000000 (add_external_source_to_decks).

ALTER TABLE "decks" ADD COLUMN "external_source" TEXT;

ALTER TABLE "decks" ADD COLUMN "external_id" TEXT;

ALTER TABLE "decks" ADD COLUMN "external_url" TEXT;

ALTER TABLE "decks" ADD COLUMN "external_synced_at" TEXT;

ALTER TABLE "decks" ADD COLUMN "external_sync_error" TEXT;

CREATE INDEX "decks_external_source_index" ON "decks" ("external_source");

