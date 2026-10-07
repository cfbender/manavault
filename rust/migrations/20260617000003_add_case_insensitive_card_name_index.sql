-- Generated from priv/repo/migrations/20260617000003_*.exs by rust/scripts/dump-migrations.py.

CREATE INDEX IF NOT EXISTS scryfall_cards_name_nocase_idx
ON scryfall_cards(name COLLATE NOCASE);

