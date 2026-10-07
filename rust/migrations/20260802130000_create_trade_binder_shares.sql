-- Generated from priv/repo/migrations/20260802130000_*.exs by rust/scripts/dump-migrations.py.

CREATE TABLE "trade_binder_shares" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "token" TEXT NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE UNIQUE INDEX "trade_binder_shares_token_index" ON "trade_binder_shares" ("token");

