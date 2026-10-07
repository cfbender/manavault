-- Migration 20260617000001 (add_finish_to_deck_cards).

ALTER TABLE "deck_cards" ADD COLUMN "finish" TEXT DEFAULT 'nonfoil' NOT NULL;

