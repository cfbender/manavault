-- Generated from priv/repo/migrations/20260802000000_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "collection_items" ADD COLUMN "for_trade" INTEGER DEFAULT false NOT NULL;

CREATE INDEX "collection_items_for_trade_index" ON "collection_items" ("for_trade");

