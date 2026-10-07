-- Migration 20260815000000 (add_normalized_flavor_names).

-- Its data changes run in db::migrate::data_step after this SQL.

ALTER TABLE "scryfall_printings" ADD COLUMN "normalized_flavor_name" TEXT;

CREATE INDEX "scryfall_printings_normalized_flavor_name_index" ON "scryfall_printings" ("normalized_flavor_name");

