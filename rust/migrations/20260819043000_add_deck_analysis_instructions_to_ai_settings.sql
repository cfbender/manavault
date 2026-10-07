-- Migration 20260819043000 (add_deck_analysis_instructions_to_ai_settings).

ALTER TABLE "ai_settings" ADD COLUMN "deck_analysis_instructions" TEXT;

