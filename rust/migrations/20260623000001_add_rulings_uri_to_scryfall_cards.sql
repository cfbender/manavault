-- Migration 20260623000001 (add_rulings_uri_to_scryfall_cards).

ALTER TABLE "scryfall_cards" ADD COLUMN "rulings_uri" TEXT;

