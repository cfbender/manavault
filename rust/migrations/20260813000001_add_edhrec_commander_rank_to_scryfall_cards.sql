-- Migration 20260813000001 (add_edhrec_commander_rank_to_scryfall_cards).

ALTER TABLE "scryfall_cards" ADD COLUMN "edhrec_commander_rank" INTEGER;

