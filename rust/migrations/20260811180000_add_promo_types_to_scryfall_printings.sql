-- Migration 20260811180000 (add_promo_types_to_scryfall_printings).

ALTER TABLE "scryfall_printings" ADD COLUMN "promo_types" TEXT DEFAULT '[]' NOT NULL;

