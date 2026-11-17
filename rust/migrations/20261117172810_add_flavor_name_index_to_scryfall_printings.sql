-- add_flavor_name_index_to_scryfall_printings
--
-- Search suggestions load every flavor-name alias (`name_index` in
-- catalog/search/suggestions.rs). No index has `flavor_name`, so the join ran
-- from every card by name and read every printing row from the table to test
-- it (seconds on a cold cache) for the few hundred printings that have one.
-- This partial covering index holds only those printings, so the join starts
-- from them. ANALYZE gives the planner its statistics, without which it keeps
-- the old plan.

CREATE INDEX "scryfall_printings_flavor_name_oracle_id_index"
ON "scryfall_printings" ("flavor_name", "oracle_id")
WHERE "flavor_name" IS NOT NULL AND "flavor_name" != '';

ANALYZE "scryfall_printings";
