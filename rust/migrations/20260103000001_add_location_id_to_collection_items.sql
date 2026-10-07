-- Generated from priv/repo/migrations/20260103000001_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "collection_items" ADD COLUMN "location_id" INTEGER CONSTRAINT "collection_items_location_id_fkey" REFERENCES "locations"("id") ON DELETE SET NULL;

CREATE INDEX "collection_items_location_id_index" ON "collection_items" ("location_id");

