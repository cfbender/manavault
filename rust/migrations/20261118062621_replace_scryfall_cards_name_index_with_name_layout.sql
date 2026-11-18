-- replace_scryfall_cards_name_index_with_name_layout
--
-- Search suggestions load every playable card name at boot (`name_index` in
-- catalog/search/suggestions.rs), filtering tokens by layout. The name index
-- lacks `layout`, so the scan read every card row from the table (seconds on
-- a cold cache). This covering index lets it read only the index. It also
-- serves every lookup the name index did, so it replaces it.

CREATE INDEX "scryfall_cards_name_layout_index" ON "scryfall_cards" ("name", "layout");

DROP INDEX "scryfall_cards_name_index";

ANALYZE "scryfall_cards";
