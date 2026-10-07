-- Migration 20260822170100 (add_status_to_deck_question_answers).

ALTER TABLE "deck_question_answers" ADD COLUMN "status" TEXT DEFAULT 'completed' NOT NULL;

ALTER TABLE "deck_question_answers" ADD COLUMN "error" TEXT;

