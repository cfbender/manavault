-- Migration 20260810130000 (add_cover_deck_card_to_decks).

ALTER TABLE "decks" ADD COLUMN "cover_deck_card_id" INTEGER CONSTRAINT "decks_cover_deck_card_id_fkey" REFERENCES "deck_cards"("id") ON DELETE SET NULL;

CREATE INDEX "decks_cover_deck_card_id_index" ON "decks" ("cover_deck_card_id");

