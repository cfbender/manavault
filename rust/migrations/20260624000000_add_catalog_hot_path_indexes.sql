-- Generated from priv/repo/migrations/20260624000000_*.exs by rust/scripts/dump-migrations.py.

CREATE INDEX scryfall_printings_oracle_release_set_collector_index
ON scryfall_printings (oracle_id, released_at DESC, set_code ASC, collector_number ASC);

CREATE INDEX "collection_items_scryfall_id_finish_index" ON "collection_items" ("scryfall_id", "finish");

CREATE INDEX "deck_cards_oracle_id_finish_index" ON "deck_cards" ("oracle_id", "finish");

