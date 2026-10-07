-- Generated from priv/repo/migrations/20260101000000_*.exs by rust/scripts/dump-migrations.py.

CREATE TABLE "scryfall_cards" ("oracle_id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "type_line" TEXT, "oracle_text" TEXT, "color_identity" TEXT DEFAULT '[]' NOT NULL, "legalities" TEXT DEFAULT '{}' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE INDEX "scryfall_cards_name_index" ON "scryfall_cards" ("name");

CREATE INDEX "scryfall_cards_oracle_id_index" ON "scryfall_cards" ("oracle_id");

CREATE TABLE "scryfall_printings" ("scryfall_id" TEXT PRIMARY KEY, "oracle_id" TEXT NOT NULL CONSTRAINT "scryfall_printings_oracle_id_fkey" REFERENCES "scryfall_cards"("oracle_id") ON DELETE CASCADE, "set_code" TEXT NOT NULL, "set_name" TEXT, "collector_number" TEXT NOT NULL, "lang" TEXT NOT NULL, "finishes" TEXT DEFAULT '[]' NOT NULL, "image_uris" TEXT DEFAULT '{}' NOT NULL, "prices" TEXT DEFAULT '{}' NOT NULL, "released_at" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE INDEX "scryfall_printings_oracle_id_index" ON "scryfall_printings" ("oracle_id");

CREATE INDEX "scryfall_printings_set_code_index" ON "scryfall_printings" ("set_code");

CREATE INDEX "scryfall_printings_collector_number_index" ON "scryfall_printings" ("collector_number");

CREATE INDEX "scryfall_printings_scryfall_id_index" ON "scryfall_printings" ("scryfall_id");

CREATE INDEX "scryfall_printings_set_code_collector_number_index" ON "scryfall_printings" ("set_code", "collector_number");

CREATE TABLE "scryfall_syncs" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "status" TEXT NOT NULL, "bulk_type" TEXT NOT NULL, "bulk_uri" TEXT, "started_at" TEXT NOT NULL, "completed_at" TEXT, "cards_count" INTEGER DEFAULT 0 NOT NULL, "printings_count" INTEGER DEFAULT 0 NOT NULL, "error" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE INDEX "scryfall_syncs_status_index" ON "scryfall_syncs" ("status");

CREATE INDEX "scryfall_syncs_bulk_type_index" ON "scryfall_syncs" ("bulk_type");

CREATE INDEX "scryfall_syncs_started_at_index" ON "scryfall_syncs" ("started_at");

