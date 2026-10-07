-- Generated from priv/repo/migrations/20261006000000_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "scryfall_cards" ADD COLUMN "layout" TEXT;

CREATE INDEX "scryfall_cards_layout_index" ON "scryfall_cards" ("layout");

CREATE TABLE "scryfall_card_tokens" ("scryfall_id" TEXT NOT NULL, "token_scryfall_id" TEXT NOT NULL);

CREATE UNIQUE INDEX "scryfall_card_tokens_scryfall_id_token_scryfall_id_index" ON "scryfall_card_tokens" ("scryfall_id", "token_scryfall_id");

CREATE INDEX "scryfall_card_tokens_token_scryfall_id_index" ON "scryfall_card_tokens" ("token_scryfall_id");

CREATE TABLE "token_items" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "scryfall_id" TEXT NOT NULL CONSTRAINT "token_items_scryfall_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE CASCADE, "back_scryfall_id" TEXT CONSTRAINT "token_items_back_scryfall_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE SET NULL, "quantity" INTEGER DEFAULT 1 NOT NULL, "finish" TEXT DEFAULT 'nonfoil' NOT NULL, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

CREATE INDEX "token_items_scryfall_id_index" ON "token_items" ("scryfall_id");

CREATE INDEX "token_items_back_scryfall_id_index" ON "token_items" ("back_scryfall_id");

