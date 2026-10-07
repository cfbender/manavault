-- Migration 20260802100001 (create_trade_want_shares).

CREATE TABLE "trade_want_shares" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "token" TEXT NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE UNIQUE INDEX "trade_want_shares_token_index" ON "trade_want_shares" ("token");

