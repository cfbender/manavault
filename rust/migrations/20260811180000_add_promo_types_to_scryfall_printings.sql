-- Generated from priv/repo/migrations/20260811180000_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "scryfall_printings" ADD COLUMN "promo_types" TEXT DEFAULT '[]' NOT NULL;

