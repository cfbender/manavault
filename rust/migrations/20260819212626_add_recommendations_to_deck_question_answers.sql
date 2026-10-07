-- Migration 20260819212626 (add_recommendations_to_deck_question_answers).

ALTER TABLE "deck_question_answers" ADD COLUMN "recommendations" TEXT;

