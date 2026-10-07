-- Generated from priv/repo/migrations/20260930000000_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "decks" ADD COLUMN "commander_bracket_rating" TEXT;

ALTER TABLE "deck_analysis_requests" ADD COLUMN "commander_bracket_rating" TEXT;

