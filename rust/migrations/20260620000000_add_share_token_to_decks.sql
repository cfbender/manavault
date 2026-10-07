-- Generated from priv/repo/migrations/20260620000000_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "decks" ADD COLUMN "share_token" TEXT;

CREATE UNIQUE INDEX "decks_share_token_index" ON "decks" ("share_token");

