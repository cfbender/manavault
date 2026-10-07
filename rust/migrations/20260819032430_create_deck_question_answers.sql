-- Migration 20260819032430 (create_deck_question_answers).

CREATE TABLE "deck_question_answers" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "deck_id" INTEGER NOT NULL CONSTRAINT "deck_question_answers_deck_id_fkey" REFERENCES "decks"("id") ON DELETE CASCADE, "question" TEXT NOT NULL, "answer" TEXT NOT NULL, "inserted_at" TEXT NOT NULL);

CREATE INDEX "deck_question_answers_deck_id_inserted_at_index" ON "deck_question_answers" ("deck_id", "inserted_at");

