-- Migration 20260622000003 (create_auth_client_failures).

CREATE TABLE "auth_client_failures" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "client_id" TEXT NOT NULL, "failed_attempts" INTEGER DEFAULT 0 NOT NULL, "banned_at" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE UNIQUE INDEX "auth_client_failures_client_id_index" ON "auth_client_failures" ("client_id");

CREATE INDEX "auth_client_failures_banned_at_index" ON "auth_client_failures" ("banned_at");

