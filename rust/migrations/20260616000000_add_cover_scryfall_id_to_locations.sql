-- Migration 20260616000000 (add_cover_scryfall_id_to_locations).

ALTER TABLE "locations" ADD COLUMN "cover_scryfall_id" TEXT CONSTRAINT "locations_cover_scryfall_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE SET NULL;

CREATE INDEX "locations_cover_scryfall_id_index" ON "locations" ("cover_scryfall_id");

