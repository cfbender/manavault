-- add_frame_to_scryfall_printings
--
-- How a printing is framed, from Scryfall: `frame_effects` (a JSON array such
-- as ["showcase", "inverted"] or ["extendedart"]), `border_color` ("black",
-- "borderless", ...), and `full_art`. Together with `promo_types` they name a
-- set's treatment sections (Borderless, Extended Art, Fracture Foil Japan
-- Showcase, ...). Rows are filled by the next catalog sync.

ALTER TABLE "scryfall_printings" ADD COLUMN "frame_effects" TEXT DEFAULT '[]' NOT NULL;
ALTER TABLE "scryfall_printings" ADD COLUMN "border_color" TEXT;
ALTER TABLE "scryfall_printings" ADD COLUMN "full_art" INTEGER DEFAULT false NOT NULL;
