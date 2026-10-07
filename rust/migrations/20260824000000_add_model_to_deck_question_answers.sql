-- Migration 20260824000000 (add_model_to_deck_question_answers).

ALTER TABLE "deck_question_answers" ADD COLUMN "model" TEXT;

