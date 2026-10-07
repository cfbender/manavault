-- Generated from priv/repo/migrations/20260102000000_*.exs by rust/scripts/dump-migrations.py.

CREATE TABLE "collection_items" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "scryfall_id" TEXT NOT NULL CONSTRAINT "collection_items_scryfall_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE CASCADE, "quantity" INTEGER DEFAULT 1 NOT NULL, "condition" TEXT DEFAULT 'near_mint' NOT NULL, "language" TEXT DEFAULT 'en' NOT NULL, "finish" TEXT DEFAULT 'nonfoil' NOT NULL, "location" TEXT, "notes" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE INDEX "collection_items_scryfall_id_index" ON "collection_items" ("scryfall_id");

CREATE INDEX "collection_items_condition_index" ON "collection_items" ("condition");

CREATE INDEX "collection_items_language_index" ON "collection_items" ("language");

CREATE INDEX "collection_items_finish_index" ON "collection_items" ("finish");

