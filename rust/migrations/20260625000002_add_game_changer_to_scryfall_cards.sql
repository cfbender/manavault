-- Generated from priv/repo/migrations/20260625000002_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "scryfall_cards" ADD COLUMN "game_changer" INTEGER DEFAULT false NOT NULL;

