-- Migration 20260930210000 (add_conversation_id_to_deck_question_answers).

ALTER TABLE "deck_question_answers" ADD COLUMN "conversation_id" TEXT;

CREATE INDEX "deck_question_answers_deck_id_conversation_id_index" ON "deck_question_answers" ("deck_id", "conversation_id");

