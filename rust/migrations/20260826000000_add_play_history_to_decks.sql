-- Generated from priv/repo/migrations/20260826000000_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "decks" ADD COLUMN "play_count" INTEGER DEFAULT 0 NOT NULL;

ALTER TABLE "decks" ADD COLUMN "skip_count" INTEGER DEFAULT 0 NOT NULL;

ALTER TABLE "decks" ADD COLUMN "last_played_at" TEXT;

