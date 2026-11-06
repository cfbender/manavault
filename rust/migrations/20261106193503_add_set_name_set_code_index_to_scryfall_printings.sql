-- add_set_name_set_code_index_to_scryfall_printings
--
-- Set suggestions (`search_sets`) match a substring of the set code or name,
-- which no index can seek, and group by both columns. The only index with
-- `set_code` lacks `set_name`, so the scan read every printing row from the
-- table (seconds on a cold cache). This covering index lets the scan read
-- only the index, in suggestion order, and stop at the limit.

CREATE INDEX "scryfall_printings_set_name_set_code_index" ON "scryfall_printings" ("set_name", "set_code");
