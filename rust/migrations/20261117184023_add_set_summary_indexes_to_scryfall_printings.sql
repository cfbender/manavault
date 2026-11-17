-- Covers the set summaries GROUP BY so it never reads printing rows.
CREATE INDEX "scryfall_printings_set_code_released_at_set_name_index"
ON "scryfall_printings" ("set_code", "released_at", "set_name");

-- Ranks a set's preview cards. The expressions must match PRICE_SQL and
-- RARITY_SQL in manavault-catalog's sets.rs exactly, or SQLite ignores them.
CREATE INDEX "scryfall_printings_set_preview_index" ON "scryfall_printings" (
  "set_code",
  COALESCE(CAST(prices->>'usd' AS REAL), CAST(prices->>'usd_foil' AS REAL), 0) DESC,
  CASE rarity WHEN 'common' THEN 1 WHEN 'uncommon' THEN 2 WHEN 'rare' THEN 3 WHEN 'mythic' THEN 4 ELSE 0 END DESC,
  "collector_number",
  "scryfall_id"
);

ANALYZE "scryfall_printings";
