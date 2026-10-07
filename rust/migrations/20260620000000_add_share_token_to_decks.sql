-- Migration 20260620000000 (add_share_token_to_decks).

ALTER TABLE "decks" ADD COLUMN "share_token" TEXT;

CREATE UNIQUE INDEX "decks_share_token_index" ON "decks" ("share_token");

