-- Migration 20260708000002 (create_default_deck_tags).

-- Its data changes run in db::migrate::data_step after this SQL.

CREATE TABLE "default_deck_tags" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "color" TEXT NOT NULL, "target_count" INTEGER, "position" INTEGER DEFAULT 0 NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE UNIQUE INDEX "default_deck_tags_name_index" ON "default_deck_tags" ("name");

