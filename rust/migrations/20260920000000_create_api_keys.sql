-- Generated from priv/repo/migrations/20260920000000_*.exs by rust/scripts/dump-migrations.py.

CREATE TABLE "api_keys" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "prefix" TEXT NOT NULL, "token_hash" BLOB NOT NULL, "last_used_at" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE UNIQUE INDEX "api_keys_token_hash_index" ON "api_keys" ("token_hash");

CREATE INDEX "api_keys_prefix_index" ON "api_keys" ("prefix");

