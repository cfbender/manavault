-- Generated from priv/repo/migrations/20260808000000_*.exs by rust/scripts/dump-migrations.py.

-- Data step: the Elixir code of this migration is ported to db::migrate::data_step.

ALTER TABLE "scryfall_cards" ADD COLUMN "normalized_name" TEXT;

CREATE INDEX "scryfall_cards_normalized_name_index" ON "scryfall_cards" ("normalized_name");

