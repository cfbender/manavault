-- Generated from priv/repo/migrations/20260703000000_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "collection_items" ADD COLUMN "location_changed_at" TEXT;

CREATE INDEX "collection_items_location_changed_at_index" ON "collection_items" ("location_changed_at");

