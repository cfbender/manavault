-- Migration 20260813000000 (add_edhrec_saltiness_to_scryfall_cards).

ALTER TABLE "scryfall_cards" ADD COLUMN "edhrec_saltiness" NUMERIC;

