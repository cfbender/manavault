-- Migration 20260617000002 (add_grouping_fields_to_catalog).

ALTER TABLE "scryfall_cards" ADD COLUMN "mana_cost" TEXT;

ALTER TABLE "scryfall_cards" ADD COLUMN "cmc" NUMERIC;

ALTER TABLE "scryfall_cards" ADD COLUMN "colors" TEXT DEFAULT '[]' NOT NULL;

ALTER TABLE "scryfall_printings" ADD COLUMN "rarity" TEXT;

