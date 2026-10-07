-- Generated from priv/repo/migrations/20260622000003_*.exs by rust/scripts/dump-migrations.py.

CREATE TABLE "auth_client_failures" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "client_id" TEXT NOT NULL, "failed_attempts" INTEGER DEFAULT 0 NOT NULL, "banned_at" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE UNIQUE INDEX "auth_client_failures_client_id_index" ON "auth_client_failures" ("client_id");

CREATE INDEX "auth_client_failures_banned_at_index" ON "auth_client_failures" ("banned_at");

