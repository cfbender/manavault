-- Migration 20261006120000 (add_tcgplayer_ids_to_printings).

ALTER TABLE "scryfall_printings" ADD COLUMN "tcgplayer_id" INTEGER;

ALTER TABLE "scryfall_printings" ADD COLUMN "tcgplayer_etched_id" INTEGER;

