-- Migration 20260802000000 (add_for_trade_to_collection_items).

ALTER TABLE "collection_items" ADD COLUMN "for_trade" INTEGER DEFAULT false NOT NULL;

CREATE INDEX "collection_items_for_trade_index" ON "collection_items" ("for_trade");

