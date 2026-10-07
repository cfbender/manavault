-- Migration 20260830000000 (create_deck_analysis_requests).

CREATE TABLE "deck_analysis_requests" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "source_type" TEXT NOT NULL, "source" TEXT NOT NULL, "source_name" TEXT NOT NULL, "format" TEXT NOT NULL, "analysis" TEXT NOT NULL, "model" TEXT NOT NULL, "commander_bracket" INTEGER, "commander_bracket_estimate" INTEGER, "inserted_at" TEXT NOT NULL);

CREATE INDEX "deck_analysis_requests_inserted_at_index" ON "deck_analysis_requests" ("inserted_at");

