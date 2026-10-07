-- Migration 20260617000005 (add_source_location_to_deck_allocations).

ALTER TABLE "deck_allocations" ADD COLUMN "source_location_id" INTEGER CONSTRAINT "deck_allocations_source_location_id_fkey" REFERENCES "locations"("id") ON DELETE SET NULL;

CREATE INDEX "deck_allocations_source_location_id_index" ON "deck_allocations" ("source_location_id");

