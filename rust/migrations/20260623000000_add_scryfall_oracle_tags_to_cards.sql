-- Generated from priv/repo/migrations/20260623000000_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "scryfall_cards" ADD COLUMN "oracle_tags" TEXT DEFAULT '[]' NOT NULL;

ALTER TABLE "scryfall_cards" ADD COLUMN "deck_category" TEXT;

ALTER TABLE "scryfall_cards" ADD COLUMN "deck_themes" TEXT DEFAULT '[]' NOT NULL;

CREATE INDEX "scryfall_cards_deck_category_index" ON "scryfall_cards" ("deck_category");

