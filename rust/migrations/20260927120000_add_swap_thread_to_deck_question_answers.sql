-- Migration 20260927120000 (add_swap_thread_to_deck_question_answers).

ALTER TABLE "deck_question_answers" ADD COLUMN "thread_id" TEXT;

ALTER TABLE "deck_question_answers" ADD COLUMN "swap_context" TEXT;

CREATE INDEX "deck_question_answers_deck_id_thread_id_index" ON "deck_question_answers" ("deck_id", "thread_id");

