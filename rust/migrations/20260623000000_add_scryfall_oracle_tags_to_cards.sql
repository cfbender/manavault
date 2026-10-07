-- Migration 20260623000000 (add_scryfall_oracle_tags_to_cards).

ALTER TABLE "scryfall_cards" ADD COLUMN "oracle_tags" TEXT DEFAULT '[]' NOT NULL;

ALTER TABLE "scryfall_cards" ADD COLUMN "deck_category" TEXT;

ALTER TABLE "scryfall_cards" ADD COLUMN "deck_themes" TEXT DEFAULT '[]' NOT NULL;

CREATE INDEX "scryfall_cards_deck_category_index" ON "scryfall_cards" ("deck_category");

