-- Migration 20260625000002 (add_game_changer_to_scryfall_cards).

ALTER TABLE "scryfall_cards" ADD COLUMN "game_changer" INTEGER DEFAULT false NOT NULL;

