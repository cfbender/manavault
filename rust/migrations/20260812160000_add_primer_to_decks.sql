-- Migration 20260812160000 (add_primer_to_decks).

ALTER TABLE "decks" ADD COLUMN "primer" TEXT;

