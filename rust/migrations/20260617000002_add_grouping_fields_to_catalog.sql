-- Generated from priv/repo/migrations/20260617000002_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "scryfall_cards" ADD COLUMN "mana_cost" TEXT;

ALTER TABLE "scryfall_cards" ADD COLUMN "cmc" NUMERIC;

ALTER TABLE "scryfall_cards" ADD COLUMN "colors" TEXT DEFAULT '[]' NOT NULL;

ALTER TABLE "scryfall_printings" ADD COLUMN "rarity" TEXT;

