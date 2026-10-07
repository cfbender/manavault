-- Generated from priv/repo/migrations/20260620000001_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "deck_cards" ADD COLUMN "proxy_quantity" INTEGER DEFAULT 0 NOT NULL;

