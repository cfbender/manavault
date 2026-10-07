-- Migration 20260622000002 (add_tag_to_deck_cards).

ALTER TABLE "deck_cards" ADD COLUMN "tag" TEXT;

CREATE INDEX "deck_cards_tag_index" ON "deck_cards" ("tag");

