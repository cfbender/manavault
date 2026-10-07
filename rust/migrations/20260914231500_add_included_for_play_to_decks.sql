-- Migration 20260914231500 (add_included_for_play_to_decks).

ALTER TABLE "decks" ADD COLUMN "included_for_play" INTEGER DEFAULT true NOT NULL;

