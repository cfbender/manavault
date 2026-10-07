-- Generated from priv/repo/migrations/20260930210000_*.exs by rust/scripts/dump-migrations.py.

ALTER TABLE "deck_question_answers" ADD COLUMN "conversation_id" TEXT;

CREATE INDEX "deck_question_answers_deck_id_conversation_id_index" ON "deck_question_answers" ("deck_id", "conversation_id");

