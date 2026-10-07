-- Migration 20260620000001 (add_proxy_quantity_to_deck_cards).

ALTER TABLE "deck_cards" ADD COLUMN "proxy_quantity" INTEGER DEFAULT 0 NOT NULL;

