-- Generated from priv/repo/migrations/20260622000002_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "deck_cards" ADD COLUMN "tag" TEXT;

CREATE INDEX "deck_cards_tag_index" ON "deck_cards" ("tag");

