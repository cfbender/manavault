-- Generated from priv/repo/migrations/20260804000000_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "collection_items" ADD COLUMN "for_trade_quantity" INTEGER DEFAULT 0 NOT NULL;

UPDATE collection_items
SET for_trade_quantity = quantity
WHERE for_trade = 1;

