-- Generated from priv/repo/migrations/20260815000000_*.exs by rust/scripts/dump-migrations.py.

-- Data step: the Elixir code of this migration is ported to db::migrate::data_step.

ALTER TABLE "scryfall_printings" ADD COLUMN "normalized_flavor_name" TEXT;

CREATE INDEX "scryfall_printings_normalized_flavor_name_index" ON "scryfall_printings" ("normalized_flavor_name");

