-- Migration 20260808000002 (add_edhrec_rank_to_scryfall_cards).

ALTER TABLE "scryfall_cards" ADD COLUMN "edhrec_rank" INTEGER;

