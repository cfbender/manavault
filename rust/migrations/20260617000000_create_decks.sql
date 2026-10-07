-- Migration 20260617000000 (create_decks).

CREATE TABLE "decks" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "format" TEXT DEFAULT 'commander' NOT NULL, "status" TEXT DEFAULT 'brewing' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE INDEX "decks_name_index" ON "decks" ("name");

CREATE INDEX "decks_format_index" ON "decks" ("format");

CREATE INDEX "decks_status_index" ON "decks" ("status");

CREATE TABLE "deck_cards" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "deck_id" INTEGER NOT NULL CONSTRAINT "deck_cards_deck_id_fkey" REFERENCES "decks"("id") ON DELETE CASCADE, "oracle_id" TEXT NOT NULL CONSTRAINT "deck_cards_oracle_id_fkey" REFERENCES "scryfall_cards"("oracle_id") ON DELETE RESTRICT, "preferred_printing_id" TEXT CONSTRAINT "deck_cards_preferred_printing_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE SET NULL, "quantity" INTEGER DEFAULT 1 NOT NULL, "zone" TEXT DEFAULT 'mainboard' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE INDEX "deck_cards_deck_id_index" ON "deck_cards" ("deck_id");

CREATE INDEX "deck_cards_oracle_id_index" ON "deck_cards" ("oracle_id");

CREATE INDEX "deck_cards_preferred_printing_id_index" ON "deck_cards" ("preferred_printing_id");

CREATE UNIQUE INDEX "deck_cards_deck_id_oracle_id_zone_index" ON "deck_cards" ("deck_id", "oracle_id", "zone");

