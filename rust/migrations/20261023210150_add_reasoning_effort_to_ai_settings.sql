-- add_reasoning_effort_to_ai_settings
--
-- The OpenRouter reasoning effort sent with deck analyses and questions.
-- NULL leaves reasoning at the model's default.

ALTER TABLE "ai_settings" ADD COLUMN "reasoning_effort" TEXT;
