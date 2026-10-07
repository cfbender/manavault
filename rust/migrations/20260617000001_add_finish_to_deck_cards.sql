-- Generated from priv/repo/migrations/20260617000001_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "deck_cards" ADD COLUMN "finish" TEXT DEFAULT 'nonfoil' NOT NULL;

