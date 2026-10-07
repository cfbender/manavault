-- Migration 20260826000000 (add_play_history_to_decks).

ALTER TABLE "decks" ADD COLUMN "play_count" INTEGER DEFAULT 0 NOT NULL;

ALTER TABLE "decks" ADD COLUMN "skip_count" INTEGER DEFAULT 0 NOT NULL;

ALTER TABLE "decks" ADD COLUMN "last_played_at" TEXT;

