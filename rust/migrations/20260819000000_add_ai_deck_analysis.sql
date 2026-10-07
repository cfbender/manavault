-- Generated from priv/repo/migrations/20260819000000_*.exs by rust/scripts/dump-migrations.py.

CREATE TABLE "ai_settings" ("id" INTEGER PRIMARY KEY, "provider" TEXT DEFAULT 'openrouter' NOT NULL, "api_key" TEXT, "model" TEXT, "inserted_at" TEXT NOT NULL, "updated_at" TEXT NOT NULL);

ALTER TABLE "decks" ADD COLUMN "ai_analysis" TEXT;

ALTER TABLE "decks" ADD COLUMN "ai_analysis_model" TEXT;

ALTER TABLE "decks" ADD COLUMN "ai_analyzed_at" TEXT;

ALTER TABLE "decks" ADD COLUMN "commander_bracket" INTEGER;

ALTER TABLE "decks" ADD COLUMN "commander_bracket_estimate" INTEGER;

