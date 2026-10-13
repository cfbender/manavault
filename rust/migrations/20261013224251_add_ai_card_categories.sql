-- Migration 20261013224251 (add_ai_card_categories).
--
-- Deck-specific card categories from the AI deck analysis, and the category
-- the Jev decision model assigned each card. `ai_card_categories` is a JSON
-- array of `{"name", "description"}` objects in display order. An assignment
-- is current while its `digest` matches the deck's categories and
-- commanders; a new analysis or commander change makes it stale.

ALTER TABLE "decks" ADD COLUMN "ai_card_categories" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE "deck_card_categories" (
  "deck_id" INTEGER NOT NULL
    CONSTRAINT "deck_card_categories_deck_id_fkey" REFERENCES "decks"("id") ON DELETE CASCADE,
  "oracle_id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "confidence" REAL,
  "digest" TEXT NOT NULL,
  "inserted_at" TEXT NOT NULL,
  "updated_at" TEXT NOT NULL,
  PRIMARY KEY ("deck_id", "oracle_id")
);
