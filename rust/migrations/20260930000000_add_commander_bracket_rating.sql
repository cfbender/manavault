-- Migration 20260930000000 (add_commander_bracket_rating).

ALTER TABLE "decks" ADD COLUMN "commander_bracket_rating" TEXT;

ALTER TABLE "deck_analysis_requests" ADD COLUMN "commander_bracket_rating" TEXT;

