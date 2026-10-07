-- Generated from priv/repo/migrations/20260708000002_*.exs by rust/scripts/dump-migrations.py.

-- Data step: the Elixir code of this migration is ported to db::migrate::data_step.

CREATE TABLE "default_deck_tags" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "color" TEXT NOT NULL, "target_count" INTEGER, "position" INTEGER DEFAULT 0 NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE UNIQUE INDEX "default_deck_tags_name_index" ON "default_deck_tags" ("name");

