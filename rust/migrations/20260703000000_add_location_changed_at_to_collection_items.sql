-- Migration 20260703000000 (add_location_changed_at_to_collection_items).

ALTER TABLE "collection_items" ADD COLUMN "location_changed_at" TEXT;

CREATE INDEX "collection_items_location_changed_at_index" ON "collection_items" ("location_changed_at");

