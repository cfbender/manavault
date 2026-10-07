-- Generated from priv/repo/migrations/20260822170100_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "deck_question_answers" ADD COLUMN "status" TEXT DEFAULT 'completed' NOT NULL;

ALTER TABLE "deck_question_answers" ADD COLUMN "error" TEXT;

