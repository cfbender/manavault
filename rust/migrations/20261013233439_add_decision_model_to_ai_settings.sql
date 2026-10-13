-- Migration 20261013233439 (add_decision_model_to_ai_settings).
--
-- The OpenRouter decision model that assigns AI tags to deck cards. NULL
-- uses the built-in default (typesafe/jev-1.13).

ALTER TABLE "ai_settings" ADD COLUMN "decision_model" TEXT;
