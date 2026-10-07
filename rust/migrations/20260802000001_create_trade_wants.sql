-- Migration 20260802000001 (create_trade_wants).

CREATE TABLE "trade_wants" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "oracle_id" TEXT NOT NULL CONSTRAINT "trade_wants_oracle_id_fkey" REFERENCES "scryfall_cards"("oracle_id") ON DELETE CASCADE, "quantity" INTEGER DEFAULT 1 NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE UNIQUE INDEX "trade_wants_oracle_id_index" ON "trade_wants" ("oracle_id");

