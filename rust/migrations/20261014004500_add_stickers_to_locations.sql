-- add_stickers_to_locations
--
-- Symbols stuck on a location like stickers: a JSON array of
-- {"kind": "mana" | "set" | "rarity", "value": ...} in display order.

ALTER TABLE "locations" ADD COLUMN "stickers" TEXT DEFAULT '[]' NOT NULL;
