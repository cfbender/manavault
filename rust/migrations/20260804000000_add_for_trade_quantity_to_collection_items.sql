-- Migration 20260804000000 (add_for_trade_quantity_to_collection_items).

ALTER TABLE "collection_items" ADD COLUMN "for_trade_quantity" INTEGER DEFAULT 0 NOT NULL;

UPDATE collection_items
SET for_trade_quantity = quantity
WHERE for_trade = 1;

