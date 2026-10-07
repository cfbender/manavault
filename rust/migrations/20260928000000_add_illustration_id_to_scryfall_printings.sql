-- Migration 20260928000000 (add_illustration_id_to_scryfall_printings).

ALTER TABLE "scryfall_printings" ADD COLUMN "illustration_id" TEXT;

ALTER TABLE "scryfall_printings" ADD COLUMN "promo" INTEGER DEFAULT false NOT NULL;

CREATE INDEX "scryfall_printings_illustration_id_index" ON "scryfall_printings" ("illustration_id");

