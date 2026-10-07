-- Migration 20260808000000 (add_normalized_card_names).

-- Its data changes run in db::migrate::data_step after this SQL.

ALTER TABLE "scryfall_cards" ADD COLUMN "normalized_name" TEXT;

CREATE INDEX "scryfall_cards_normalized_name_index" ON "scryfall_cards" ("normalized_name");

