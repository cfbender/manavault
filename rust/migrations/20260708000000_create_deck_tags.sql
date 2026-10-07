-- Generated from priv/repo/migrations/20260708000000_*.exs by rust/scripts/dump-migrations.py.

CREATE TABLE "deck_tags" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "deck_id" INTEGER NOT NULL CONSTRAINT "deck_tags_deck_id_fkey" REFERENCES "decks"("id") ON DELETE CASCADE, "name" TEXT NOT NULL, "color" TEXT NOT NULL, "target_count" INTEGER, "position" INTEGER DEFAULT 0 NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE INDEX "deck_tags_deck_id_index" ON "deck_tags" ("deck_id");

CREATE UNIQUE INDEX "deck_tags_deck_id_name_index" ON "deck_tags" ("deck_id", "name");

