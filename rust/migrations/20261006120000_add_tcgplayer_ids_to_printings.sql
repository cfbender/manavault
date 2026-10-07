-- Generated from priv/repo/migrations/20261006120000_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "scryfall_printings" ADD COLUMN "tcgplayer_id" INTEGER;

ALTER TABLE "scryfall_printings" ADD COLUMN "tcgplayer_etched_id" INTEGER;

