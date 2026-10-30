-- add_search_fields_to_scryfall_catalog
--
-- The Scryfall fields the search syntax filters on
-- (https://scryfall.com/docs/syntax) that the catalog did not store yet.
--
-- Cards: `power`, `toughness`, and `loyalty` (as Scryfall writes them, so
-- "*" and "1+*" survive; the first face that has one for multi-faced cards),
-- `keywords` and `produced_mana` (JSON arrays), `reserved`, and
-- `search_flags`: a JSON array of `is:` flags the importer derives from the
-- card (land cycles, commander roles, French vanilla, ...).
--
-- Printings: `artist`, `watermark`, `frame` (the frame edition, such as
-- "2015"), `security_stamp`, `set_type`, `games` (a JSON array), and the
-- `reprint`, `booster`, `story_spotlight`, and `highres_image` flags.
--
-- `scryfall_sets` holds every Scryfall set, for block (`b:`) and set group
-- (`g:`) searches.
--
-- Rows are filled by the next catalog sync.

ALTER TABLE "scryfall_cards" ADD COLUMN "power" TEXT;
ALTER TABLE "scryfall_cards" ADD COLUMN "toughness" TEXT;
ALTER TABLE "scryfall_cards" ADD COLUMN "loyalty" TEXT;
ALTER TABLE "scryfall_cards" ADD COLUMN "keywords" TEXT DEFAULT '[]' NOT NULL;
ALTER TABLE "scryfall_cards" ADD COLUMN "produced_mana" TEXT DEFAULT '[]' NOT NULL;
ALTER TABLE "scryfall_cards" ADD COLUMN "reserved" INTEGER DEFAULT false NOT NULL;
ALTER TABLE "scryfall_cards" ADD COLUMN "search_flags" TEXT DEFAULT '[]' NOT NULL;

ALTER TABLE "scryfall_printings" ADD COLUMN "artist" TEXT;
ALTER TABLE "scryfall_printings" ADD COLUMN "watermark" TEXT;
ALTER TABLE "scryfall_printings" ADD COLUMN "frame" TEXT;
ALTER TABLE "scryfall_printings" ADD COLUMN "security_stamp" TEXT;
ALTER TABLE "scryfall_printings" ADD COLUMN "set_type" TEXT;
ALTER TABLE "scryfall_printings" ADD COLUMN "games" TEXT DEFAULT '[]' NOT NULL;
ALTER TABLE "scryfall_printings" ADD COLUMN "reprint" INTEGER DEFAULT false NOT NULL;
ALTER TABLE "scryfall_printings" ADD COLUMN "booster" INTEGER DEFAULT false NOT NULL;
ALTER TABLE "scryfall_printings" ADD COLUMN "story_spotlight" INTEGER DEFAULT false NOT NULL;
ALTER TABLE "scryfall_printings" ADD COLUMN "highres_image" INTEGER DEFAULT false NOT NULL;

CREATE TABLE "scryfall_sets" (
  "code" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT,
  "set_type" TEXT,
  "block_code" TEXT,
  "parent_set_code" TEXT,
  "released_at" TEXT
);
