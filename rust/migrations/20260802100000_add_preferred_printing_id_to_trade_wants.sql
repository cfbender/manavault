-- Migration 20260802100000 (add_preferred_printing_id_to_trade_wants).

ALTER TABLE "trade_wants" ADD COLUMN "preferred_printing_id" TEXT CONSTRAINT "trade_wants_preferred_printing_id_fkey" REFERENCES "scryfall_printings"("scryfall_id") ON DELETE SET NULL;

CREATE INDEX "trade_wants_preferred_printing_id_index" ON "trade_wants" ("preferred_printing_id");

DROP INDEX "trade_wants_oracle_id_index";

CREATE UNIQUE INDEX "trade_wants_oracle_id_generic_index" ON "trade_wants" ("oracle_id") WHERE preferred_printing_id IS NULL;

CREATE UNIQUE INDEX "trade_wants_oracle_id_preferred_printing_id_index" ON "trade_wants" ("oracle_id", "preferred_printing_id") WHERE preferred_printing_id IS NOT NULL;

