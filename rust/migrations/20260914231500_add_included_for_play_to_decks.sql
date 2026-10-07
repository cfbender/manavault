-- Generated from priv/repo/migrations/20260914231500_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "decks" ADD COLUMN "included_for_play" INTEGER DEFAULT true NOT NULL;

