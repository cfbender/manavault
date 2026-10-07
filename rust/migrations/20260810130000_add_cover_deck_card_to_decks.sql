-- Generated from priv/repo/migrations/20260810130000_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "decks" ADD COLUMN "cover_deck_card_id" INTEGER CONSTRAINT "decks_cover_deck_card_id_fkey" REFERENCES "deck_cards"("id") ON DELETE SET NULL;

CREATE INDEX "decks_cover_deck_card_id_index" ON "decks" ("cover_deck_card_id");

