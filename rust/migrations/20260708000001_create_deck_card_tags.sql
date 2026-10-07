-- Migration 20260708000001 (create_deck_card_tags).

CREATE TABLE "deck_card_tags" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "deck_card_id" INTEGER NOT NULL CONSTRAINT "deck_card_tags_deck_card_id_fkey" REFERENCES "deck_cards"("id") ON DELETE CASCADE, "deck_tag_id" INTEGER NOT NULL CONSTRAINT "deck_card_tags_deck_tag_id_fkey" REFERENCES "deck_tags"("id") ON DELETE CASCADE, "deck_id" INTEGER NOT NULL CONSTRAINT "deck_card_tags_deck_id_fkey" REFERENCES "decks"("id") ON DELETE CASCADE, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE INDEX "deck_card_tags_deck_tag_id_index" ON "deck_card_tags" ("deck_tag_id");

CREATE UNIQUE INDEX "deck_card_tags_deck_card_id_deck_tag_id_index" ON "deck_card_tags" ("deck_card_id", "deck_tag_id");

