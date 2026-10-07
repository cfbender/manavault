-- Migration 20260908000000 (add_search_covering_indexes).

CREATE INDEX scryfall_printings_search_covering_index
ON scryfall_printings (scryfall_id, oracle_id, set_code, set_name, collector_number,
                       rarity, released_at, normalized_flavor_name,
                       json_extract(prices, '$.usd'),
                       json_extract(prices, '$.usd_foil'),
                       json_extract(prices, '$.usd_etched'));

CREATE INDEX "collection_items_search_covering_index" ON "collection_items" ("scryfall_id", "location_id", "id", "quantity", "for_trade_quantity", "finish", "inserted_at", "purchase_price_cents", "condition", "language");

DROP INDEX scryfall_printings_oracle_release_set_collector_index;

CREATE INDEX scryfall_printings_oracle_release_set_collector_index
ON scryfall_printings (oracle_id, released_at DESC, set_code ASC, collector_number ASC,
                       normalized_flavor_name, set_name, scryfall_id, rarity, lang);

CREATE INDEX scryfall_cards_search_covering_index
ON scryfall_cards (oracle_id, name, normalized_name, type_line, colors, color_identity, cmc);

DROP INDEX "scryfall_printings_scryfall_id_index";

DROP INDEX "scryfall_printings_oracle_id_index";

DROP INDEX "scryfall_printings_set_code_index";

DROP INDEX "scryfall_cards_oracle_id_index";

ANALYZE;

