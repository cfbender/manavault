-- Generated from priv/repo/migrations/20260924000000_*.exs by rust/scripts/dump-migrations.py.

CREATE TABLE "appearance_settings" ("id" INTEGER PRIMARY KEY, "palette" TEXT DEFAULT 'claret' NOT NULL, "theme_style" TEXT DEFAULT 'glass' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

