-- Generated from priv/repo/migrations/20260617000005_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "deck_allocations" ADD COLUMN "source_location_id" INTEGER CONSTRAINT "deck_allocations_source_location_id_fkey" REFERENCES "locations"("id") ON DELETE SET NULL;

CREATE INDEX "deck_allocations_source_location_id_index" ON "deck_allocations" ("source_location_id");

