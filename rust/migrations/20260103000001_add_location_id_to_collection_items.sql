-- Migration 20260103000001 (add_location_id_to_collection_items).

ALTER TABLE "collection_items" ADD COLUMN "location_id" INTEGER CONSTRAINT "collection_items_location_id_fkey" REFERENCES "locations"("id") ON DELETE SET NULL;

CREATE INDEX "collection_items_location_id_index" ON "collection_items" ("location_id");

